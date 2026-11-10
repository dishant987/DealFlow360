import type { Request, Response } from 'express'
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  quoteLines,
  customers,
  products,
  invoices,
  payments,
  creditNotes,
  billingSchedules,
  subscriptionPlans,
  fulfillmentAllocations,
  users,
  auditLog,
  appSettings,
  warehouses,
  stock,
  negotiationRequests,
  organizations,
  contacts,
  productVariants,
} from '../models/schema.js'
import { findDiscountAnomalies } from '../services/anomaly.js'
import { replenishmentPlan, type StockRule } from '../services/replenishment.js'
import { createRequire } from 'module'
import { quoteNumber, invoiceNumber } from '../services/quoteNumber.js'
import { computeLine, computeQuoteTotals } from '../services/pricing.js'
import { buildOverview } from '../services/overview.js'
import { money as fmt, orgCurrency } from '../utils/format.js'
import { z } from 'zod'
import { sendInvoice } from '../utils/mailer.js'

const ACTIVE_STATUSES = ['draft', 'pending_approval', 'sent', 'under_negotiation'] as const

/* ---- Workspace summary: the KPI tiles + activity feed on the home screen ---- */
export async function getWorkspaceSummary(req: Request, res: Response) {
  // a rep's home screen counts their own deals; everyone else sees the pipeline
  const mine = req.user!.role === 'rep' ? eq(quotations.repId, req.user!.id) : undefined

  const [settings] = await db.select().from(appSettings).limit(1)
  const stalledDays = settings ? settings.stalledDays : 7
  const cutoff = Date.now() - stalledDays * 86_400_000

  const quotes = await db
    .select({
      id: quotations.id,
      repId: quotations.repId,
      status: quotations.status,
      riskScore: quotations.riskScore,
      lastActivityAt: quotations.lastActivityAt,
      updatedAt: quotations.updatedAt,
      orderDiscountPct: quotations.orderDiscountPct,
      portalToken: quotations.portalToken,
    })
    .from(quotations)
    .where(mine)

  const ids = quotes.map((q) => q.id)
  const backordered = ids.length
    ? await db
        .selectDistinct({ id: fulfillmentAllocations.quotationId })
        .from(fulfillmentAllocations)
        .where(
          and(
            eq(fulfillmentAllocations.backordered, true),
            inArray(fulfillmentAllocations.quotationId, ids),
          ),
        )
    : []

  // "at risk" = the same three signals the Deal Health board flags, de-duplicated
  const atRisk = new Set<string>()
  for (const q of quotes)
    if (
      ACTIVE_STATUSES.includes(q.status as (typeof ACTIVE_STATUSES)[number]) &&
      new Date(q.lastActivityAt).getTime() < cutoff
    )
      atRisk.add(q.id)
  for (const a of findDiscountAnomalies(
    quotes.map((q) => ({ id: q.id, repId: q.repId, riskScore: Number(q.riskScore) })),
  ))
    atRisk.add(a.id)
  for (const b of backordered) atRisk.add(b.id)

  const activity = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      user: users.name,
      customer: customers.name,
      quotationId: auditLog.quotationId,
      seqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
    })
    .from(auditLog)
    .innerJoin(quotations, eq(auditLog.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(mine)
    .orderBy(desc(auditLog.createdAt))
    .limit(8)

  // ---- overview: KPIs and charts, from the same role-scoped quotes ----
  const ids2 = quotes.map((q) => q.id)
  const lines = ids2.length ? await db.select().from(quoteLines).where(inArray(quoteLines.quotationId, ids2)) : []
  const byQuote = new Map<string, typeof lines>()
  for (const l of lines) byQuote.set(l.quotationId, [...(byQuote.get(l.quotationId) ?? []), l])
  const invs = await db
    .select({ amount: invoices.amount, issuedAt: invoices.issuedAt, status: invoices.status, dueAt: invoices.dueAt })
    .from(invoices)
    .innerJoin(quotations, eq(invoices.quotationId, quotations.id))
    .where(mine)
  const overview = buildOverview(
    quotes.map((q) => {
      const ls = byQuote.get(q.id) ?? []
      return {
        status: q.status,
        total: computeQuoteTotals(ls, q.orderDiscountPct).total,
        gross: ls.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0),
        updatedAt: new Date(q.updatedAt),
      }
    }),
    invs.map((i) => ({ amount: Number(i.amount), issuedAt: new Date(i.issuedAt) })),
  )

  // ---- my tasks: what is waiting on this person, each with where to go ----
  const isRep = req.user!.role === 'rep'
  const stalled = quotes.filter(
    (q) =>
      ACTIVE_STATUSES.includes(q.status as (typeof ACTIVE_STATUSES)[number]) &&
      new Date(q.lastActivityAt).getTime() < cutoff,
  ).length
  const [openReq] = await db
    .select({ n: count() })
    .from(negotiationRequests)
    .innerJoin(quotations, eq(negotiationRequests.quotationId, quotations.id))
    .where(and(eq(negotiationRequests.status, 'open'), mine))
  const now = Date.now()
  const overdue = invs.filter((i) => i.status === 'sent' && i.dueAt && new Date(i.dueAt).getTime() < now).length
  const tasks = [
    !isRep && { key: 'approvals', label: 'Quotations waiting for approval', count: quotes.filter((q) => q.status === 'pending_approval').length, to: '/approvals' },
    { key: 'requests', label: 'Customer requests to answer', count: Number(openReq?.n ?? 0), to: '/quotations' },
    { key: 'stalled', label: `Deals with no activity for ${stalledDays}+ days`, count: stalled, to: isRep ? '/quotations' : '/deal-health' },
    !isRep && { key: 'overdue', label: 'Overdue invoices', count: overdue, to: '/invoices' },
    isRep && { key: 'drafts', label: 'Draft quotations to finish', count: quotes.filter((q) => q.status === 'draft').length, to: '/quotations' },
  ].filter(Boolean)

  // ---- first-run checklist, only while the company is still setting up ----
  const [[prod], [cust], [allQuotes]] = await Promise.all([
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(customers),
    db.select({ n: count() }).from(quotations),
  ])
  const steps = {
    products: Number(prod.n) > 0,
    customers: Number(cust.n) > 0,
    quotes: Number(allQuotes.n) > 0,
    sent: quotes.some((q) => q.portalToken),
  }
  const checklist = Object.values(steps).every(Boolean) ? null : steps

  res.json({
    overview,
    tasks,
    checklist,
    pendingApprovals: quotes.filter((q) => q.status === 'pending_approval').length,
    openQuotations: quotes.filter((q) =>
      ACTIVE_STATUSES.includes(q.status as (typeof ACTIVE_STATUSES)[number]),
    ).length,
    atRisk: atRisk.size,
    scope: req.user!.role === 'rep' ? 'yours' : 'all',
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action.replace(/[_:]/g, ' '),
      customer: a.customer,
      user: a.user ?? 'customer (portal)',
      createdAt: a.createdAt,
      quotationId: a.quotationId,
      quoteNumber: quoteNumber(a.seqNo, a.quoteCreatedAt),
    })),
  })
}

/* ---- #12 Invoices list (cross-quotation) ---- */
export async function listInvoices(req: Request, res: Response) {
  const conds: SQL[] = []
  if (req.query.status) conds.push(eq(invoices.status, String(req.query.status) as any))
  if (req.query.type) conds.push(eq(invoices.type, String(req.query.type) as any))

  const rows = await db
    .select({
      id: invoices.id,
      seqNo: invoices.seqNo,
      type: invoices.type,
      status: invoices.status,
      amount: invoices.amount,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      quotationId: invoices.quotationId,
      quoteSeqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      customer: customers.name,
    })
    .from(invoices)
    .innerJoin(quotations, eq(invoices.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(invoices.issuedAt))

  const out = rows.map((r) => ({
    ...r,
    invoiceNumber: invoiceNumber(r.seqNo, r.issuedAt),
    quoteNumber: quoteNumber(r.quoteSeqNo, r.quoteCreatedAt),
    overdue: r.status !== 'paid' && !!r.dueAt && new Date(r.dueAt) < new Date(),
  }))

  res.json({
    invoices: out,
    summary: {
      count: out.length,
      outstanding: round2(
        out.filter((i) => i.status !== 'paid').reduce((s, i) => s + Number(i.amount), 0),
      ),
      paid: round2(out.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)),
      overdue: out.filter((i) => i.overdue).length,
    },
  })
}

const round2 = (x: number) => Math.round(x * 100) / 100
const require = createRequire(import.meta.url)
const BRAND = '#4652C8'
const LIGHT = '#F3EEF2'

/* ---- #13 Invoice detail ---- */
export async function getInvoice(req: Request<{ id: string }>, res: Response) {
  const [inv] = await db
    .select({
      id: invoices.id,
      seqNo: invoices.seqNo,
      type: invoices.type,
      status: invoices.status,
      amount: invoices.amount,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      quotationId: invoices.quotationId,
      quoteSeqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      quoteStatus: quotations.status,
      orderDiscountPct: quotations.orderDiscountPct,
      customer: customers.name,
      customerEmail: customers.email,
      customerTier: customers.tier,
    })
    .from(invoices)
    .innerJoin(quotations, eq(invoices.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(invoices.id, req.params.id))
  if (!inv) return res.status(404).json({ error: 'not found' })

  // the lines this invoice was raised from (one-time vs recurring)
  const wanted = inv.type === 'onetime' ? 'onetime' : 'subscription'
  const rawLines = await db
    .select({
      id: quoteLines.id,
      product: products.name,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(and(eq(quoteLines.quotationId, inv.quotationId), eq(quoteLines.lineType, wanted)))

  const pays = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, inv.id))
    .orderBy(desc(payments.paidAt))
  const credits = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.quotationId, inv.quotationId))

  const paid = pays.reduce((s, p) => s + Number(p.amount), 0)

  // Delivery/billing timeline, derived from state we already hold — nothing is
  // marked shipped until every allocation on the order has left a warehouse.
  const allocs = await db
    .select({
      backordered: fulfillmentAllocations.backordered,
      createdAt: fulfillmentAllocations.createdAt,
    })
    .from(fulfillmentAllocations)
    .where(eq(fulfillmentAllocations.quotationId, inv.quotationId))
  const shipped = allocs.length > 0 && allocs.every((a) => !a.backordered)
  const lastAlloc = allocs.length
    ? allocs.map((a) => a.createdAt).sort((a, b) => +new Date(b) - +new Date(a))[0]
    : null
  // An invoice cannot exist unless the order cleared approval or the customer
  // confirmed it — billing generation refuses any other status. So read the
  // confirmation off the audit trail rather than off the CURRENT status, which
  // may since have moved on (or back) and would render the steps out of order.
  const confirmedEntry = await db
    .select({ action: auditLog.action, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.quotationId, inv.quotationId),
        inArray(auditLog.action, [
          'customer_confirmed',
          'approve:finance',
          'approve:manager',
          'billing_generated',
        ]),
      ),
    )
    .orderBy(auditLog.createdAt)
    .limit(1)

  const timeline = [
    {
      key: 'confirmed',
      label: 'Order Confirmed',
      done: true,
      at: (confirmedEntry[0]?.createdAt ?? null) as Date | null,
    },
    {
      key: 'shipped',
      label: 'Shipped',
      done: shipped,
      at: shipped ? lastAlloc : null,
      note: allocs.some((a) => a.backordered) ? 'partially allocated — backorder open' : undefined,
    },
    { key: 'invoiced', label: 'Invoiced', done: true, at: inv.issuedAt },
    { key: 'paid', label: 'Paid', done: inv.status === 'paid', at: inv.paidAt },
  ]

  res.json({
    ...inv,
    timeline,
    invoiceNumber: invoiceNumber(inv.seqNo, inv.issuedAt),
    quoteNumber: quoteNumber(inv.quoteSeqNo, inv.quoteCreatedAt),
    overdue: inv.status !== 'paid' && !!inv.dueAt && new Date(inv.dueAt) < new Date(),
    lines: rawLines.map((l) => ({ ...l, net: computeLine(l).net })),
    payments: pays,
    creditNotes: credits,
    paidTotal: round2(paid),
    balance: round2(Number(inv.amount) - paid),
  })
}

/* ---- #7 Fulfillment queue (cross-quotation) ---- */
export async function listFulfillmentQueue(_req: Request, res: Response) {
  const quotes = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      createdAt: quotations.createdAt,
      status: quotations.status,
      customer: customers.name,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(inArray(quotations.status, ['approved', 'confirmed', 'fulfilled', 'invoiced']))
    .orderBy(desc(quotations.updatedAt))

  const ids = quotes.map((q) => q.id)
  const allocs = ids.length
    ? await db
        .select()
        .from(fulfillmentAllocations)
        .where(inArray(fulfillmentAllocations.quotationId, ids))
    : []

  // Live stock per warehouse. Stock is decremented the moment an allocation is
  // accepted, so stock.quantity IS the available figure; "reserved" is what has
  // been allocated to a deal that has not been invoiced out yet.
  const onHand = await db
    .select({
      warehouseId: stock.warehouseId,
      warehouse: warehouses.name,
      productId: stock.productId,
      product: products.name,
      available: stock.quantity,
      reorderLevel: stock.reorderLevel,
      targetLevel: stock.targetLevel,
      stockId: stock.id,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .innerJoin(products, eq(stock.productId, products.id))
    .orderBy(warehouses.name, products.name)

  const reservedRows = await db
    .select({
      warehouseId: fulfillmentAllocations.warehouseId,
      productId: quoteLines.productId,
      quantity: fulfillmentAllocations.quantity,
    })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .innerJoin(quotations, eq(fulfillmentAllocations.quotationId, quotations.id))
    .where(
      and(eq(fulfillmentAllocations.backordered, false), eq(quotations.status, 'fulfilled')),
    )
  const reservedBy = new Map<string, number>()
  for (const r of reservedRows)
    if (r.warehouseId)
      reservedBy.set(
        `${r.warehouseId}:${r.productId}`,
        (reservedBy.get(`${r.warehouseId}:${r.productId}`) ?? 0) + r.quantity,
      )

  const stockRows = onHand.map((s) => {
    const reserved = reservedBy.get(`${s.warehouseId}:${s.productId}`) ?? 0
    return {
      warehouseId: s.warehouseId,
      warehouse: s.warehouse,
      productId: s.productId,
      product: s.product,
      inStock: s.available + reserved,
      reserved,
      available: s.available,
      reorderLevel: s.reorderLevel,
      targetLevel: s.targetLevel,
      belowReorder: s.available <= s.reorderLevel,
    }
  })

  // A4: the reorder rules turned into concrete restock proposals
  const rules: StockRule[] = onHand.map((s) => ({
    stockId: s.stockId,
    warehouse: s.warehouse,
    product: s.product,
    onHand: s.available + (reservedBy.get(`${s.warehouseId}:${s.productId}`) ?? 0),
    reserved: reservedBy.get(`${s.warehouseId}:${s.productId}`) ?? 0,
    reorderLevel: s.reorderLevel,
    targetLevel: s.targetLevel,
  }))
  const replenishment = replenishmentPlan(rules)

  const orders = quotes.map((q) => {
      const mine = allocs.filter((a) => a.quotationId === q.id)
      const allocated = mine.filter((a) => !a.backordered).reduce((n, a) => n + a.quantity, 0)
      const backordered = mine.filter((a) => a.backordered).reduce((n, a) => n + a.quantity, 0)
      const shipments = new Set(
        mine.filter((a) => !a.backordered && a.warehouseId).map((a) => a.warehouseId),
      ).size
      return {
        id: q.id,
        quoteNumber: quoteNumber(q.seqNo, q.createdAt),
        customer: q.customer,
        status: q.status,
        updatedAt: q.updatedAt,
        allocated,
        backordered,
        shipments,
        // awaiting = never split; partial = has a backorder; complete = fully allocated
        state: mine.length === 0 ? 'awaiting' : backordered > 0 ? 'partial' : 'complete',
      }
    })

  res.json({ orders, stock: stockRows, replenishment })
}

/* ---- #9 Subscriptions list (cross-quotation) ---- */
export async function listSubscriptions(_req: Request, res: Response) {
  const rows = await db
    .select({
      id: billingSchedules.id,
      quotationId: billingSchedules.quotationId,
      seqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      customer: customers.name,
      quoteLineId: billingSchedules.quoteLineId,
      product: products.name,
      plan: subscriptionPlans.name,
      interval: subscriptionPlans.interval,
      quantity: quoteLines.quantity,
      amount: billingSchedules.amount,
      nextBillingDate: billingSchedules.nextBillingDate,
      status: billingSchedules.status,
    })
    .from(billingSchedules)
    .innerJoin(quotations, eq(billingSchedules.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .innerJoin(quoteLines, eq(billingSchedules.quoteLineId, quoteLines.id))
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .innerJoin(subscriptionPlans, eq(billingSchedules.subscriptionPlanId, subscriptionPlans.id))
    .orderBy(billingSchedules.nextBillingDate)

  const out = rows.map((r) => ({
    ...r,
    quoteNumber: quoteNumber(r.seqNo, r.quoteCreatedAt),
    dueSoon:
      r.status === 'scheduled' &&
      new Date(r.nextBillingDate).getTime() - Date.now() < 7 * 86_400_000,
  }))

  const active = out.filter((s) => s.status === 'scheduled')
  res.json({
    subscriptions: out,
    summary: {
      active: active.length,
      // paused plans are excluded from MRR below — they are not billing right now
      paused: out.filter((s) => s.status === 'paused').length,
      cancelled: out.filter((s) => s.status === 'cancelled').length,
      // normalised to a monthly figure so mixed intervals are comparable
      mrr: round2(
        active.reduce((sum, s) => {
          const perMonth =
            s.interval === 'monthly' ? 1 : s.interval === 'quarterly' ? 1 / 3 : 1 / 12
          return sum + Number(s.amount) * perMonth
        }, 0),
      ),
    },
  })
}

/* ---- downloadable invoice PDF ---- */
/** The invoice as a PDF document (pdfmake), shared by download, preview and email. Null when not found. */
async function invoiceDoc(id: string, orgId: string | undefined) {
  const cur = await orgCurrency(orgId)
  const [inv] = await db
    .select({
      id: invoices.id,
      seqNo: invoices.seqNo,
      type: invoices.type,
      status: invoices.status,
      amount: invoices.amount,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      quotationId: invoices.quotationId,
      quoteSeqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      orderDiscountPct: quotations.orderDiscountPct,
      customerPo: quotations.customerPo,
      paymentTermsDays: quotations.paymentTermsDays,
      notesToCustomer: quotations.notesToCustomer,
      terms: quotations.terms,
      contactId: quotations.contactId,
      customer: customers.name,
      customerEmail: customers.email,
      billingAddress: customers.billingAddress,
      taxId: customers.taxId,
    })
    .from(invoices)
    .innerJoin(quotations, eq(invoices.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(invoices.id, id))
  if (!inv) return null

  const wanted = inv.type === 'onetime' ? 'onetime' : 'subscription'
  const rawLines = await db
    .select({
      product: products.name,
      variantAttribute: productVariants.attribute,
      variantValue: productVariants.value,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .leftJoin(productVariants, eq(quoteLines.variantId, productVariants.id))
    .where(and(eq(quoteLines.quotationId, inv.quotationId), eq(quoteLines.lineType, wanted)))

  const pays = await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
  const paid = round2(pays.reduce((s, p) => s + Number(p.amount), 0))
  const balance = round2(Number(inv.amount) - paid)
  const invNo = invoiceNumber(inv.seqNo, inv.issuedAt)
  // organizations isn't under row-level security; the id comes from the signed-in request
  const [org] = orgId
    ? await db
        .select({
          name: organizations.name,
          address: organizations.address,
          taxId: organizations.taxId,
          contactEmail: organizations.contactEmail,
          phone: organizations.phone,
          website: organizations.website,
          paymentInstructions: organizations.paymentInstructions,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
    : []
  const seller = org?.name ?? 'Dealwise'
  const [contact] = inv.contactId
    ? await db.select({ name: contacts.name, email: contacts.email }).from(contacts).where(eq(contacts.id, inv.contactId))
    : []

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = (d: Date | string | null) => {
    if (!d) return '—'
    const x = new Date(d)
    return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`
  }
  const m = (n: number) => fmt(n, cur)
  const nets = rawLines.map((l) => computeLine(l).net)
  const subtotal = round2(nets.reduce((s, n) => s + n, 0))
  const total = Number(inv.amount)
  // the stored invoice amount is the truth; anything between it and the lines is shown, never hidden
  const adjustment = round2(total - subtotal)
  const adjustmentLabel =
    adjustment < 0 && Number(inv.orderDiscountPct) > 0 ? `Order discount (${Number(inv.orderDiscountPct)}%)` : 'Adjustments'
  const overdue = balance > 0 && !!inv.dueAt && new Date(inv.dueAt) < new Date()
  const stamp = balance <= 0 ? { text: 'PAID', color: '#0F8A5F' } : overdue ? { text: 'OVERDUE', color: '#C0392B' } : null

  const PdfPrinter = require('pdfmake')
  const printer = new PdfPrinter({
    Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  })
  const INK = '#1F2430'
  const MUTED = '#6B7280'
  const RULE = '#E5E7EB'
  const W = 515 // A4 width minus margins

  const label = (text: string) => ({ text: text.toUpperCase(), fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.6, margin: [0, 0, 0, 3] })
  const kv = (k: string, v: string) => [
    { text: k, color: MUTED, fontSize: 9 },
    { text: v, fontSize: 9, alignment: 'right', bold: k === 'Due date' },
  ]
  const totalRow = (k: string, v: string, opts: { bold?: boolean; big?: boolean; fill?: string; color?: string } = {}) => [
    { text: k, bold: opts.bold, fontSize: opts.big ? 11 : 9.5, fillColor: opts.fill, color: opts.color ?? INK, margin: [6, opts.big ? 5 : 2, 0, opts.big ? 5 : 2] },
    { text: v, bold: opts.bold, fontSize: opts.big ? 11 : 9.5, alignment: 'right', fillColor: opts.fill, color: opts.color ?? INK, margin: [0, opts.big ? 5 : 2, 6, opts.big ? 5 : 2] },
  ]

  const items = [
    ['#', 'Description', 'Qty', 'Unit price', 'Disc.', 'Amount'].map((h, i) => ({
      text: h,
      bold: true,
      fontSize: 8.5,
      color: 'white',
      fillColor: BRAND,
      alignment: i >= 2 ? 'right' : 'left',
      margin: [0, 3, 0, 3],
    })),
    ...rawLines.map((l, i) => [
      { text: String(i + 1), color: MUTED, fontSize: 9 },
      {
        stack: [
          { text: l.product, fontSize: 9.5 },
          ...(l.variantValue ? [{ text: `${l.variantAttribute ?? 'Option'}: ${l.variantValue}`, fontSize: 8, color: MUTED }] : []),
        ],
      },
      { text: String(l.quantity), alignment: 'right', fontSize: 9.5 },
      { text: m(Number(l.unitPrice)), alignment: 'right', fontSize: 9.5 },
      { text: Number(l.discountPct) ? `${Number(l.discountPct)}%` : '—', alignment: 'right', fontSize: 9.5, color: Number(l.discountPct) ? INK : MUTED },
      { text: m(nets[i]), alignment: 'right', fontSize: 9.5 },
    ]),
  ]

  const billTo = [
    label('Bill to'),
    { text: inv.customer, bold: true, fontSize: 11 },
    ...(contact?.name ? [{ text: `Attn: ${contact.name}`, fontSize: 9 }] : []),
    ...(inv.billingAddress ? [{ text: inv.billingAddress, fontSize: 9, color: INK, margin: [0, 2, 0, 0] }] : []),
    ...(inv.taxId ? [{ text: `Tax ID: ${inv.taxId}`, fontSize: 9, margin: [0, 2, 0, 0] }] : []),
    { text: contact?.email ?? inv.customerEmail, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] },
  ]
  const details = {
    table: {
      widths: ['*', 'auto'],
      body: [
        kv('Invoice no.', invNo),
        kv('Issue date', day(inv.issuedAt)),
        kv('Due date', day(inv.dueAt)),
        kv('Payment terms', `Net ${inv.paymentTermsDays}`),
        ...(inv.customerPo ? [kv('PO number', inv.customerPo)] : []),
        kv('Quote ref.', quoteNumber(inv.quoteSeqNo, inv.quoteCreatedAt)),
      ],
    },
    layout: 'noBorders',
  }

  const notes = [
    ...(inv.notesToCustomer ? [label('Notes'), { text: inv.notesToCustomer, fontSize: 9, margin: [0, 0, 0, 10] }] : []),
    label('Payment'),
    {
      text:
        balance <= 0
          ? `Paid in full — thank you.`
          : `Please pay ${m(balance)} by ${day(inv.dueAt)} and quote ${invNo} as the payment reference.`,
      fontSize: 9,
      margin: [0, 0, 0, org?.paymentInstructions && balance > 0 ? 4 : 10],
    },
    ...(org?.paymentInstructions && balance > 0 ? [{ text: org.paymentInstructions, fontSize: 9, margin: [0, 0, 0, 10] }] : []),
    ...(inv.type !== 'onetime' ? [{ text: 'Recurring charge: later periods are billed automatically on the same schedule.', fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 10] }] : []),
    ...(inv.terms ? [label('Terms'), { text: inv.terms, fontSize: 8.5, color: MUTED }] : []),
  ]

  const doc = printer.createPdfKitDocument({
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 56],
    info: { title: `Invoice ${invNo}`, author: seller, subject: `Invoice for ${inv.customer}` },
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: INK, lineHeight: 1.2 },
    footer: (current: number, count: number) => ({
      margin: [40, 16, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 0.5, lineColor: RULE }] },
        {
          columns: [
            { text: `${seller} · ${invNo}`, fontSize: 7.5, color: MUTED },
            { text: `Page ${current} of ${count}`, fontSize: 7.5, color: MUTED, alignment: 'right' },
          ],
          margin: [0, 6, 0, 0],
        },
      ],
    }),
    content: [
      {
        columns: [
          {
            // the seller, from Settings → Company
            stack: [
              { text: seller, fontSize: 16, bold: true, color: BRAND },
              ...(org?.address ? [{ text: org.address, fontSize: 8.5, color: MUTED, margin: [0, 3, 0, 0] }] : []),
              ...(org?.taxId ? [{ text: `Tax ID: ${org.taxId}`, fontSize: 8.5, color: MUTED }] : []),
              ...([org?.contactEmail, org?.phone, org?.website].some(Boolean)
                ? [{ text: [org?.contactEmail, org?.phone, org?.website].filter(Boolean).join('  ·  '), fontSize: 8.5, color: MUTED }]
                : []),
            ],
          },
          {
            stack: [
              { text: 'INVOICE', fontSize: 24, bold: true, characterSpacing: 2, alignment: 'right' },
              { text: invNo, fontSize: 10, color: MUTED, alignment: 'right', margin: [0, 2, 0, 0] },
              ...(stamp
                ? [
                    {
                      // tables ignore `alignment`; an empty star column pushes the stamp right
                      columns: [
                        { width: '*', text: '' },
                        {
                          width: 'auto',
                          table: { body: [[{ text: stamp.text, bold: true, fontSize: 10, color: stamp.color, characterSpacing: 1.5, margin: [8, 2, 8, 2] }]] },
                          layout: { hLineColor: () => stamp.color, vLineColor: () => stamp.color, hLineWidth: () => 1.2, vLineWidth: () => 1.2 },
                        },
                      ],
                      margin: [0, 6, 0, 0],
                    },
                  ]
                : []),
            ],
            alignment: 'right',
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W, y2: 0, lineWidth: 2, lineColor: BRAND }], margin: [0, 14, 0, 18] },
      { columns: [{ width: '*', stack: billTo }, { width: 210, stack: [label('Invoice details'), details] }], columnGap: 24, margin: [0, 0, 0, 22] },
      {
        table: { headerRows: 1, widths: [16, '*', 34, 72, 40, 78], body: items.length > 1 ? items : [...items, [{ text: 'No line items.', colSpan: 6, color: MUTED }, '', '', '', '', '']] },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => RULE,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          paddingLeft: (i: number) => (i === 0 ? 6 : 4),
          paddingRight: (i: number, node: { table: { widths: unknown[] } }) => (i === node.table.widths.length - 1 ? 6 : 4),
        },
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 230,
            table: {
              widths: ['*', 'auto'],
              body: [
                totalRow('Subtotal', m(subtotal)),
                ...(Math.abs(adjustment) >= 0.01 ? [totalRow(adjustmentLabel, `${adjustment < 0 ? '-' : '+'}${m(Math.abs(adjustment))}`)] : []),
                totalRow('Total', m(total), { bold: true }),
                ...(paid > 0 ? [totalRow('Amount paid', `-${m(paid)}`)] : []),
                totalRow('Balance due', m(balance), { bold: true, big: true, fill: LIGHT, color: balance > 0 ? INK : '#0F8A5F' }),
              ],
            },
            layout: {
              hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length - 2 ? 0.8 : 0),
              vLineWidth: () => 0,
              hLineColor: () => RULE,
            },
          },
        ],
        margin: [0, 12, 0, 26],
      },
      ...notes,
    ],
  })

  return { doc, invNo, inv, balance }
}

export async function invoicePdf(req: Request<{ id: string }>, res: Response) {
  const r = await invoiceDoc(req.params.id, req.orgId)
  if (!r) return res.status(404).json({ error: 'not found' })
  res.setHeader('Content-Type', 'application/pdf')
  // ?inline=1 shows it in the browser (preview); otherwise it downloads
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${r.invNo}.pdf"`)
  r.doc.pipe(res)
  r.doc.end()
}

/** Email the invoice PDF. The recipient defaults to the customer in the UI but can be anyone. */
export async function emailInvoice(req: Request<{ id: string }>, res: Response) {
  const p = z
    .object({ to: z.string().trim().email('Enter a valid email address'), message: z.string().trim().max(2000).optional() })
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? 'Enter a valid email address' })
  const r = await invoiceDoc(req.params.id, req.orgId)
  if (!r) return res.status(404).json({ error: 'not found' })
  const chunks: Buffer[] = []
  r.doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((ok) => r.doc.on('end', () => ok()))
  r.doc.end()
  await done
  const cur = await orgCurrency(req.orgId)
  await sendInvoice(p.data.to, {
    invoiceNumber: r.invNo,
    customer: r.inv.customer,
    amount: fmt(Number(r.inv.amount), cur),
    balance: fmt(r.balance, cur),
    due: r.inv.dueAt ? new Date(r.inv.dueAt).toLocaleDateString() : null,
    message: p.data.message,
    pdf: Buffer.concat(chunks),
  })
  await db.insert(auditLog).values({
    quotationId: r.inv.quotationId,
    userId: req.user!.id,
    action: 'invoice_emailed',
    detail: { invoice: r.invNo, to: p.data.to },
  })
  res.json({ ok: true, to: p.data.to })
}
