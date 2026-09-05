import type { Request, Response } from 'express'
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm'
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
} from '../models/schema.js'
import { createRequire } from 'module'
import { quoteNumber, invoiceNumber } from '../services/quoteNumber.js'
import { computeLine } from '../services/pricing.js'

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
const PURPLE = '#714B67'
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

  res.json({
    ...inv,
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

  res.json(
    quotes.map((q) => {
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
    }),
  )
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
export async function invoicePdf(req: Request<{ id: string }>, res: Response) {
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
      customer: customers.name,
      customerEmail: customers.email,
    })
    .from(invoices)
    .innerJoin(quotations, eq(invoices.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(invoices.id, req.params.id))
  if (!inv) return res.status(404).json({ error: 'not found' })

  const wanted = inv.type === 'onetime' ? 'onetime' : 'subscription'
  const rawLines = await db
    .select({
      product: products.name,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(and(eq(quoteLines.quotationId, inv.quotationId), eq(quoteLines.lineType, wanted)))

  const pays = await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
  const paid = round2(pays.reduce((s, p) => s + Number(p.amount), 0))
  const balance = round2(Number(inv.amount) - paid)
  const invNo = invoiceNumber(inv.seqNo, inv.issuedAt)

  const PdfPrinter = require('pdfmake')
  const printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  })

  const body = [
    [
      { text: 'Description', style: 'th' },
      { text: 'Qty', style: 'th', alignment: 'right' },
      { text: 'Unit price', style: 'th', alignment: 'right' },
      { text: 'Discount', style: 'th', alignment: 'right' },
      { text: 'Amount', style: 'th', alignment: 'right' },
    ],
    ...rawLines.map((l) => [
      l.product,
      { text: String(l.quantity), alignment: 'right' },
      { text: `$${Number(l.unitPrice).toFixed(2)}`, alignment: 'right' },
      { text: `${Number(l.discountPct).toFixed(0)}%`, alignment: 'right' },
      { text: `$${computeLine(l).net.toFixed(2)}`, alignment: 'right' },
    ]),
  ]

  const money = (label: string, value: string, bold = false) => ({
    columns: [
      { text: label, alignment: 'right', bold },
      { text: value, alignment: 'right', width: 90, bold },
    ],
    margin: [0, 2, 0, 0],
  })

  const doc = printer.createPdfKitDocument({
    pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    styles: {
      th: { bold: true, color: 'white', fillColor: PURPLE },
      label: { fontSize: 8, color: '#888' },
    },
    footer: (current: number, total: number) => ({
      margin: [40, 0, 40, 20],
      columns: [
        { text: 'DealFlow360', fontSize: 7, color: '#999' },
        { text: `Page ${current} of ${total}`, alignment: 'right', fontSize: 7, color: '#999' },
      ],
    }),
    content: [
      {
        columns: [
          { text: 'DealFlow360', fontSize: 16, bold: true, color: PURPLE },
          { text: 'INVOICE', fontSize: 16, bold: true, alignment: 'right', color: '#333' },
        ],
      },
      { text: invNo, alignment: 'right', fontSize: 11, margin: [0, 2, 0, 16] },
      {
        columns: [
          [
            { text: 'BILL TO', style: 'label' },
            { text: inv.customer, bold: true },
            { text: inv.customerEmail, fontSize: 9, color: '#666' },
          ],
          [
            { text: 'DETAILS', style: 'label', alignment: 'right' },
            {
              text: `Issued  ${new Date(inv.issuedAt).toLocaleDateString()}`,
              alignment: 'right',
              fontSize: 9,
            },
            {
              text: `Due     ${inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '—'}`,
              alignment: 'right',
              fontSize: 9,
            },
            {
              text: `Ref     ${quoteNumber(inv.quoteSeqNo, inv.quoteCreatedAt)}`,
              alignment: 'right',
              fontSize: 9,
            },
            {
              text: inv.status.toUpperCase(),
              alignment: 'right',
              bold: true,
              color: inv.status === 'paid' ? '#0a7' : '#c80',
              margin: [0, 4, 0, 0],
            },
          ],
        ],
        margin: [0, 0, 0, 18],
      },
      {
        table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body },
        layout: { fillColor: (i: number) => (i > 0 && i % 2 === 0 ? LIGHT : null) },
      },
      { text: '', margin: [0, 10, 0, 0] },
      money('Invoice total', `$${Number(inv.amount).toFixed(2)}`),
      money('Paid', `$${paid.toFixed(2)}`),
      money('Balance due', `$${balance.toFixed(2)}`, true),
      {
        text:
          inv.type === 'recurring'
            ? 'Recurring charge. Subsequent periods are billed automatically on the schedule.'
            : 'Thank you for your business.',
        margin: [0, 24, 0, 0],
        fontSize: 9,
        color: '#666',
      },
    ],
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${invNo}.pdf"`)
  doc.pipe(res)
  doc.end()
}
