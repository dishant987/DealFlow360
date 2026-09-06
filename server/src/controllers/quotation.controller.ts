import type { Request, Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  quoteLines,
  customers,
  products,
  priceListItems,
  discountTiers,
  categoryDiscountCeilings,
  appSettings,
  approvals,
  auditLog,
  negotiationRequests,
  productPairings,
  productVariants,
  invoices,
} from '../models/schema.js'
import { sendPortalLink } from '../utils/mailer.js'
import { computeQuoteTotals } from '../services/pricing.js'
import { computeBlendedRisk } from '../services/risk.js'
import { quoteNumber } from '../services/quoteNumber.js'

// A quote is only editable while it belongs to the rep. Once submitted, an
// approver is reviewing a specific set of numbers — changing them underneath
// would invalidate the risk score they were routed on. 'Return for revision'
// puts it back to draft, which is the supported way to reopen it.
const EDITABLE = ['draft', 'rejected']
const notEditable = (status: string) =>
  `This quotation is ${status.replace(/_/g, ' ')} — it can no longer be edited. Ask an approver to return it for revision.`

// A quotation only reaches the customer once its discounts have cleared the risk
// router. Sending a draft or an in-review quote would put numbers in front of the
// customer that no approver ever signed off on.
const SENDABLE = ['approved', 'sent', 'under_negotiation', 'confirmed']

// Resolve each line's effective ceiling (min of tier + category) and score the quote.
export async function scoreQuotation(quotationId: string) {
  const [q] = await db
    .select({ tier: customers.tier, orderDiscountPct: quotations.orderDiscountPct })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, quotationId))
  if (!q) return null
  const orderDiscount = Number(q.orderDiscountPct)

  const lines = await db
    .select({
      id: quoteLines.id,
      discountPct: quoteLines.discountPct,
      categoryId: products.categoryId,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(eq(quoteLines.quotationId, quotationId))

  const [tierRow] = await db.select().from(discountTiers).where(eq(discountTiers.tier, q.tier))
  // Fail CLOSED. A missing tier ceiling used to mean 100%, i.e. no line could ever
  // breach and the whole approval chain quietly stopped applying to that tier.
  // With no configured discretion, any discount is over the limit and gets reviewed.
  const tierCeiling = tierRow ? Number(tierRow.maxDiscountPct) : 0
  const catMap = new Map(
    (await db.select().from(categoryDiscountCeilings)).map((c) => [
      c.categoryId,
      Number(c.maxDiscountPct),
    ]),
  )
  const [settings] = await db.select().from(appSettings).limit(1)
  const thresholds = {
    managerThreshold: settings ? Number(settings.managerThreshold) : 5,
    financeThreshold: settings ? Number(settings.financeThreshold) : 12,
  }

  const riskLines = lines.map((l) => {
    const cat = catMap.get(l.categoryId)
    return {
      // order-level discount stacks on top of the line discount for risk purposes
      discountPct: Number(l.discountPct) + orderDiscount,
      ceiling: cat != null ? Math.min(tierCeiling, cat) : tierCeiling,
    }
  })
  const risk = computeBlendedRisk(riskLines, thresholds)
  // breaches carry the index into riskLines, which is built from `lines` in order —
  // map it back to the line id so the client never has to match on position
  const overByIndex = new Map(risk.breaches.map((b) => [b.index, b.overBy]))
  return {
    ...risk,
    // the builder re-derives the routing level live as the rep edits, so it needs
    // the same two thresholds the server scored against
    thresholds,
    orderDiscountPct: orderDiscount,
    byLine: lines.map((l, i) => ({
      lineId: l.id,
      ceiling: riskLines[i].ceiling,
      overBy: overByIndex.get(i) ?? 0,
    })),
  }
}

/* ---- list: quote + customer name + computed total ---- */
export async function listQuotations(req: Request, res: Response) {
  // same rule as quotationAccessParam: a rep's pipeline is their own deals
  const scope = req.user!.role === 'rep' ? eq(quotations.repId, req.user!.id) : undefined
  const quotes = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      createdAt: quotations.createdAt,
      status: quotations.status,
      customerId: quotations.customerId,
      customer: customers.name,
      orderDiscountPct: quotations.orderDiscountPct,
      riskScore: quotations.riskScore,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(scope)

  const ids = quotes.map((q) => q.id)
  const lines = ids.length
    ? await db.select().from(quoteLines).where(inArray(quoteLines.quotationId, ids))
    : []

  const byQuote = new Map<string, typeof lines>()
  for (const l of lines) {
    const arr = byQuote.get(l.quotationId) ?? []
    arr.push(l)
    byQuote.set(l.quotationId, arr)
  }

  res.json(
    quotes.map((q) => ({
      ...q,
      quoteNumber: quoteNumber(q.seqNo, q.createdAt),
      amount: computeQuoteTotals(byQuote.get(q.id) ?? [], q.orderDiscountPct).total,
    })),
  )
}

/* ---- detail: quote + customer + lines + totals ---- */
export async function getQuotation(req: Request<{ id: string }>, res: Response) {
  const [quote] = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      status: quotations.status,
      customerId: quotations.customerId,
      customer: customers.name,
      customerTier: customers.tier,
      repId: quotations.repId,
      orderDiscountPct: quotations.orderDiscountPct,
      riskScore: quotations.riskScore,
      requiresManager: quotations.requiresManager,
      requiresFinance: quotations.requiresFinance,
      portalToken: quotations.portalToken,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, req.params.id))
  if (!quote) return res.status(404).json({ error: 'not found' })

  const lines = await db
    .select({
      id: quoteLines.id,
      productId: quoteLines.productId,
      product: products.name,
      variantAttribute: productVariants.attribute,
      variantValue: productVariants.value,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
      subscriptionPlanId: quoteLines.subscriptionPlanId,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .leftJoin(productVariants, eq(quoteLines.variantId, productVariants.id))
    .where(eq(quoteLines.quotationId, req.params.id))

  const risk = await scoreQuotation(req.params.id)
  const ceilingByLine = new Map((risk?.byLine ?? []).map((b) => [b.lineId, b.ceiling]))
  // The rep needs the portal link back after a reload, not just in the response
  // to /send — otherwise the only copy of it is gone the moment they navigate
  // away. Hand back the built URL and drop the raw token: nothing internal has a
  // use for it on its own, and the link is the thing you share.
  const { portalToken, ...rest } = quote
  res.json({
    ...rest,
    portalUrl: portalToken
      ? `${process.env.CLIENT_URL || 'http://localhost:5173'}/portal/${portalToken}`
      : null,
    quoteNumber: quoteNumber(quote.seqNo, quote.createdAt),
    // ceiling = min(tier, category) for this line. The client re-checks it live as
    // the rep types, so a breach shows before submit rather than after.
    lines: lines.map((l) => ({ ...l, ceiling: ceilingByLine.get(l.id) ?? null })),
    totals: computeQuoteTotals(lines, quote.orderDiscountPct),
    risk,
  })
}

/* ---- submit: score, route, set status (auto approval routing) ---- */
export async function submitQuotation(req: Request<{ id: string }>, res: Response) {
  const risk = await scoreQuotation(req.params.id)
  if (!risk) return res.status(404).json({ error: 'not found' })

  const status = risk.level === 'none' ? 'approved' : 'pending_approval'
  const [q] = await db
    .update(quotations)
    .set({
      riskScore: String(risk.score),
      requiresManager: risk.requiresManager,
      requiresFinance: risk.requiresFinance,
      status,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(eq(quotations.id, req.params.id))
    .returning()
  if (!q) return res.status(404).json({ error: 'not found' })

  // reset approval steps and create fresh pending ones for this submission
  await db.delete(approvals).where(eq(approvals.quotationId, q.id))
  if (risk.requiresManager)
    await db.insert(approvals).values({ quotationId: q.id, step: 'manager' })
  if (risk.requiresFinance)
    await db.insert(approvals).values({ quotationId: q.id, step: 'finance' })

  await db.insert(auditLog).values({
    quotationId: q.id,
    userId: req.user!.id,
    action: 'submitted',
    detail: { score: risk.score, level: risk.level, breaches: risk.breaches },
  })

  res.json({ quotation: q, risk })
}

/* ---- create draft ---- */
export async function createQuotation(req: Request, res: Response) {
  const p = z.object({ customerId: z.string().uuid() }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [q] = await db
    .insert(quotations)
    .values({ customerId: p.data.customerId, repId: req.user!.id })
    .returning()
  res.status(201).json({ ...q, quoteNumber: quoteNumber(q.seqNo, q.createdAt) })
}

async function touch(quotationId: string) {
  await db
    .update(quotations)
    .set({ updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, quotationId))
}

// A3: every edit is logged with user, timestamp and (optional) reason
async function logEdit(
  quotationId: string,
  userId: string,
  action: string,
  detail: Record<string, unknown>,
  reason?: string,
) {
  await db.insert(auditLog).values({ quotationId, userId, action, detail, reason: reason ?? null })
  await touch(quotationId)
}

/* ---- add a line (snapshots tier price + cost) ---- */
export async function addLine(req: Request<{ id: string }>, res: Response) {
  const p = z
    .object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      quantity: z.number().int().positive().optional(),
      discountPct: z.union([z.number(), z.string()]).optional(),
      reason: z.string().optional(),
      // set by the upsell panel so reporting can tell a suggested add from a
      // line the rep picked out of the catalogue themselves
      viaUpsell: z.boolean().optional(),
    })
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })

  const [quote] = await db
    .select({ id: quotations.id, tier: customers.tier, status: quotations.status })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, req.params.id))
  if (!quote) return res.status(404).json({ error: 'quotation not found' })
  if (!EDITABLE.includes(quote.status))
    return res.status(400).json({ error: notEditable(quote.status) })

  const [product] = await db.select().from(products).where(eq(products.id, p.data.productId))
  if (!product) return res.status(400).json({ error: 'product not found' })

  // tier price override if present, else base price
  const [tierPrice] = await db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.productId, product.id), eq(priceListItems.tier, quote.tier)))
  let unitPrice = Number(tierPrice?.unitPrice ?? product.unitPrice)

  // variant extra price stacks on top of the (tier) base price
  let variant = null
  if (p.data.variantId) {
    const [v] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, p.data.variantId))
    if (!v || v.productId !== product.id)
      return res.status(400).json({ error: 'variant does not belong to product' })
    variant = v
    unitPrice += Number(v.extraPrice)
  }

  const [line] = await db
    .insert(quoteLines)
    .values({
      quotationId: quote.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      quantity: p.data.quantity ?? 1,
      unitPrice: String(unitPrice),
      unitCost: product.unitCost,
      discountPct: p.data.discountPct != null ? String(p.data.discountPct) : '0',
      lineType: product.type,
      subscriptionPlanId: product.subscriptionPlanId,
    })
    .returning()
  const scored = await scoreQuotation(quote.id)
  const ceiling = scored?.byLine.find((b) => b.lineId === line.id)?.ceiling ?? null
  await logEdit(
    quote.id,
    req.user!.id,
    'line_added',
    {
      product: product.name,
      variant: variant ? `${variant.attribute}: ${variant.value}` : null,
      quantity: p.data.quantity ?? 1,
      unitPrice,
      viaUpsell: p.data.viaUpsell ?? false,
    },
    p.data.reason,
  )
  res.status(201).json({ ...line, ceiling })
}

/* ---- update a line ---- */
export async function updateLine(req: Request<{ id: string; lineId: string }>, res: Response) {
  const p = z
    .object({
      quantity: z.number().int().positive(),
      discountPct: z.union([z.number(), z.string()]).transform(String),
      reason: z.string(),
    })
    .partial()
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const { reason, ...patch } = p.data
  const [parent] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!parent) return res.status(404).json({ error: 'not found' })
  if (!EDITABLE.includes(parent.status))
    return res.status(400).json({ error: notEditable(parent.status) })
  const [before] = await db.select().from(quoteLines).where(eq(quoteLines.id, req.params.lineId))
  const [line] = await db
    .update(quoteLines)
    .set(patch)
    .where(and(eq(quoteLines.id, req.params.lineId), eq(quoteLines.quotationId, req.params.id)))
    .returning()
  if (!line) return res.status(404).json({ error: 'not found' })
  await logEdit(
    req.params.id,
    req.user!.id,
    'line_updated',
    {
      lineId: line.id,
      from: { quantity: before?.quantity, discountPct: before?.discountPct },
      to: { quantity: line.quantity, discountPct: line.discountPct },
    },
    reason,
  )
  res.json(line)
}

/* ---- delete a line ---- */
export async function deleteLine(req: Request<{ id: string; lineId: string }>, res: Response) {
  const [parent] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!parent) return res.status(404).json({ error: 'not found' })
  if (!EDITABLE.includes(parent.status))
    return res.status(400).json({ error: notEditable(parent.status) })
  const [line] = await db
    .delete(quoteLines)
    .where(and(eq(quoteLines.id, req.params.lineId), eq(quoteLines.quotationId, req.params.id)))
    .returning()
  if (!line) return res.status(404).json({ error: 'not found' })
  await logEdit(req.params.id, req.user!.id, 'line_removed', {
    lineId: line.id,
    productId: line.productId,
    quantity: line.quantity,
  })
  res.json({ ok: true })
}

/* ---- upsell / cross-sell suggestions (A6/B5) ---- */
export async function getUpsell(req: Request<{ id: string }>, res: Response) {
  const cart = await db
    .select({ productId: quoteLines.productId })
    .from(quoteLines)
    .where(eq(quoteLines.quotationId, req.params.id))
  const inCart = new Set(cart.map((c) => c.productId))

  const [settings] = await db.select().from(appSettings).limit(1)
  const minMargin = settings ? Number(settings.minUpsellMarginPct) : 20

  // products paired with anything already in the cart (co-purchase history)
  const paired = inCart.size
    ? await db
        .select({
          suggestedId: productPairings.suggestedProductId,
          score: productPairings.score,
          pairedWith: productPairings.productId,
        })
        .from(productPairings)
        .where(inArray(productPairings.productId, [...inCart]))
    : []

  const scoreById = new Map<string, number>()
  const pairedWithById = new Map<string, string>()
  for (const p of paired) {
    if (inCart.has(p.suggestedId)) continue
    scoreById.set(p.suggestedId, Math.max(scoreById.get(p.suggestedId) ?? 0, p.score))
    pairedWithById.set(p.suggestedId, p.pairedWith)
  }

  const candidates = await db.select().from(products)
  const nameById = new Map(candidates.map((p) => [p.id, p.name]))

  const suggestions = candidates
    .filter((p) => p.active && !inCart.has(p.id))
    .map((p) => {
      const price = Number(p.unitPrice)
      const marginPct = price > 0 ? Math.round(((price - Number(p.unitCost)) / price) * 100) : 0
      const paired = scoreById.has(p.id)
      return {
        productId: p.id,
        name: p.name,
        unitPrice: p.unitPrice,
        unitCost: p.unitCost, // lets the client compute the true order-margin delta
        marginPct,
        isPromoted: p.isPromoted,
        paired,
        score: scoreById.get(p.id) ?? 0,
        reason: paired ? `Often bought with ${nameById.get(pairedWithById.get(p.id)!)}` : p.isPromoted ? 'Promoted' : '',
      }
    })
    // only healthy-margin suggestions surface, and only paired or promoted ones
    .filter((s) => s.marginPct >= minMargin && (s.paired || s.isPromoted))
    .sort((a, b) => Number(b.isPromoted) - Number(a.isPromoted) || b.score - a.score)
    .slice(0, 5)

  res.json(suggestions)
}

/* ---- send to customer: generate portal token + set status 'sent' ---- */
export async function sendToCustomer(req: Request<{ id: string }>, res: Response) {
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
  const [before] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!before) return res.status(404).json({ error: 'not found' })
  if (!SENDABLE.includes(before.status))
    return res.status(400).json({
      error: `This quotation is ${before.status.replace(/_/g, ' ')} — it must be approved before it can be sent to the customer.`,
    })

  const token = crypto.randomBytes(24).toString('hex')
  const [q] = await db
    .update(quotations)
    .set({ portalToken: token, status: 'sent', updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()
  if (!q) return res.status(404).json({ error: 'not found' })

  // Email the magic link (console fallback when SMTP isn't set). The link is
  // already live the moment the token is stored, so the rep must NOT wait on the
  // mail server — a slow or unreachable SMTP host used to block this response for
  // seconds. Hand off in the background and record how it went when it settles.
  const portalUrl = `${CLIENT_URL}/portal/${token}`
  const [customer] = await db.select().from(customers).where(eq(customers.id, q.customerId))
  if (customer?.email) {
    void sendPortalLink(customer.email, portalUrl, customer.name)
      .then(() =>
        db.insert(auditLog).values({
          quotationId: q.id,
          action: 'portal_link_emailed',
          detail: { to: customer.email },
        }),
      )
      .catch((e: Error) => {
        console.error('portal link email failed:', e.message)
        return db.insert(auditLog).values({
          quotationId: q.id,
          action: 'portal_link_email_failed',
          detail: { to: customer.email, error: e.message },
        })
      })
  }

  await db.insert(auditLog).values({
    quotationId: q.id,
    userId: req.user!.id,
    action: 'sent_to_customer',
    detail: { to: customer?.email ?? null },
  })
  // `emailed` reports that delivery was STARTED, not that it landed — the
  // portal_link_emailed / _failed audit entry carries the real outcome.
  res.json({
    portalToken: token,
    portalUrl,
    emailed: !!customer?.email,
    sentTo: customer?.email ?? null,
  })
}

/* ---- rep view of customer negotiation requests ---- */
export async function listNegotiations(req: Request<{ id: string }>, res: Response) {
  // joined to the line so the rep sees WHICH product a question is about,
  // rather than a bare uuid
  res.json(
    await db
      .select({
        id: negotiationRequests.id,
        type: negotiationRequests.type,
        message: negotiationRequests.message,
        counterDiscountPct: negotiationRequests.counterDiscountPct,
        requestedDeliveryDate: negotiationRequests.requestedDeliveryDate,
        status: negotiationRequests.status,
        createdAt: negotiationRequests.createdAt,
        quoteLineId: negotiationRequests.quoteLineId,
        product: products.name,
      })
      .from(negotiationRequests)
      .leftJoin(quoteLines, eq(negotiationRequests.quoteLineId, quoteLines.id))
      .leftJoin(products, eq(quoteLines.productId, products.id))
      .where(eq(negotiationRequests.quotationId, req.params.id))
      .orderBy(negotiationRequests.createdAt),
  )
}

/* ---- B8: the rep's side of the conversation — close off a request once it has
   been dealt with, so the customer's asks do not pile up unanswered ---- */
export async function resolveNegotiation(
  req: Request<{ id: string; negotiationId: string }>,
  res: Response,
) {
  const [row] = await db
    .update(negotiationRequests)
    .set({ status: 'addressed' })
    .where(
      and(
        eq(negotiationRequests.id, req.params.negotiationId),
        eq(negotiationRequests.quotationId, req.params.id),
      ),
    )
    .returning()
  if (!row) return res.status(404).json({ error: 'request not found on this quotation' })

  await logEdit(req.params.id, req.user!.id, 'negotiation_addressed', {
    negotiationId: row.id,
    type: row.type,
    message: row.message,
  })
  res.json(row)
}

/* ---- update quote (order-level discount) ---- */
export async function updateQuotation(req: Request<{ id: string }>, res: Response) {
  const p = z
    .object({
      orderDiscountPct: z.union([z.number(), z.string()]).transform(String),
      reason: z.string(),
    })
    .partial()
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const { reason, ...patch } = p.data
  const [before] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!before) return res.status(404).json({ error: 'not found' })
  if (patch.orderDiscountPct != null && !EDITABLE.includes(before.status))
    return res.status(400).json({ error: notEditable(before.status) })
  const [q] = await db
    .update(quotations)
    .set({ ...patch, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()
  if (!q) return res.status(404).json({ error: 'not found' })
  if (patch.orderDiscountPct != null)
    await logEdit(
      q.id,
      req.user!.id,
      'order_discount_changed',
      { from: before?.orderDiscountPct, to: q.orderDiscountPct },
      reason,
    )
  res.json(q)
}

/* ---- delete a draft ----
   Only a draft, and only one that has never been through the approval router.
   Deleting cascades to its lines AND its audit entries, so anything that carries
   a decision on the record has to be cancelled instead — that keeps the trail
   the brief asks for while still letting a rep bin a genuine scratch draft.

   Who may do it is already settled by quotationAccessParam on this router: a rep
   reaches only their own drafts, manager/finance/admin reach any. */
export async function deleteQuotation(req: Request<{ id: string }>, res: Response) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!q) return res.status(404).json({ error: 'not found' })
  if (q.status !== 'draft')
    return res.status(400).json({
      error: `Only a draft can be deleted — this quotation is ${q.status.replace(/_/g, ' ')}. Cancel it instead.`,
    })

  const history = await db.select().from(approvals).where(eq(approvals.quotationId, q.id))
  if (history.length)
    return res.status(400).json({
      error:
        'This draft has already been through approval. Cancel it instead so the approver’s decision stays on record.',
    })

  const [billed] = await db.select().from(invoices).where(eq(invoices.quotationId, q.id)).limit(1)
  if (billed)
    return res.status(400).json({ error: 'This quotation has been invoiced — it cannot be deleted.' })

  await db.delete(quotations).where(eq(quotations.id, q.id))
  res.json({ ok: true, deleted: quoteNumber(q.seqNo, q.createdAt) })
}

/* ---- cancel a deal (drag-to-Rejected in the pipeline) ---- */
export async function cancelQuotation(req: Request<{ id: string }>, res: Response) {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
  const [before] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!before) return res.status(404).json({ error: 'not found' })
  if (['fulfilled', 'invoiced'].includes(before.status))
    return res.status(400).json({ error: 'This deal is already fulfilled or invoiced — it cannot be cancelled.' })

  const [q] = await db
    .update(quotations)
    .set({ status: 'cancelled', updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()
  await db.insert(auditLog).values({
    quotationId: q.id,
    userId: req.user!.id,
    action: 'cancelled',
    detail: { from: before.status },
    reason: reason ?? null,
  })
  res.json(q)
}
