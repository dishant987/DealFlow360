import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  quoteLines,
  products,
  productVariants,
  customers,
  negotiationRequests,
  approvals,
  auditLog,
} from '../models/schema.js'
import { computeQuoteTotals } from '../services/pricing.js'
import { scoreQuotation } from './quotation.controller.js'
import { quoteNumber } from '../services/quoteNumber.js'

// the customer may only act while the quote is genuinely open to them
const OPEN_TO_CUSTOMER = ['sent', 'under_negotiation']
const closedMsg = (status: string) =>
  status === 'confirmed'
    ? 'You have already confirmed this quotation.'
    : `This quotation is ${status.replace(/_/g, ' ')} and is no longer open for changes.`

// Resolve a quote by its portal token. Returns null if not found.
async function findByToken(token: string) {
  const [q] = await db.select().from(quotations).where(eq(quotations.portalToken, token))
  return q ?? null
}

// Customer-safe projection: NO cost/margin ever leaves the server.
export async function getPortalQuote(req: Request<{ token: string }>, res: Response) {
  const q = await findByToken(req.params.token)
  if (!q) return res.status(404).json({ error: 'invalid link' })

  const [customer] = await db.select().from(customers).where(eq(customers.id, q.customerId))
  // The variant is part of WHAT the customer is buying and can carry its own
  // extra price, so leaving it off turned a "27 inch" line into a bare product
  // name at a price the catalogue does not show — and made two variants of the
  // same product read as two identical lines at different prices.
  const lines = await db
    .select({
      id: quoteLines.id,
      product: products.name,
      variantAttribute: productVariants.attribute,
      variantValue: productVariants.value,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost, // used only for totals below, not returned
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .leftJoin(productVariants, eq(quoteLines.variantId, productVariants.id))
    .where(eq(quoteLines.quotationId, q.id))

  const totals = computeQuoteTotals(lines, q.orderDiscountPct)
  const negotiations = await db
    .select()
    .from(negotiationRequests)
    .where(eq(negotiationRequests.quotationId, q.id))

  res.json({
    quoteNumber: quoteNumber(q.seqNo, q.createdAt),
    customer: customer?.name,
    status: q.status,
    orderDiscountPct: q.orderDiscountPct,
    // strip cost — customers only see selling price
    lines: lines.map((l) => ({
      id: l.id,
      product: l.product,
      variantAttribute: l.variantAttribute,
      variantValue: l.variantValue,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      lineType: l.lineType,
    })),
    total: totals.total,
    subtotal: totals.subtotal,
    negotiations,
  })
}

const negSchema = z.object({
  type: z.enum(['comment', 'change_request', 'counter_discount']),
  message: z.string().optional(),
  counterDiscountPct: z.union([z.number(), z.string()]).optional(),
  quoteLineId: z.string().uuid().optional(),
  // "can we have this by the 20th?" — a date-only value from the portal's date input
  requestedDeliveryDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date')
    .optional(),
})

export async function submitNegotiation(req: Request<{ token: string }>, res: Response) {
  const q = await findByToken(req.params.token)
  if (!q) return res.status(404).json({ error: 'invalid link' })
  if (!OPEN_TO_CUSTOMER.includes(q.status))
    return res.status(400).json({ error: closedMsg(q.status) })
  const parsed = negSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  await db.insert(negotiationRequests).values({
    quotationId: q.id,
    quoteLineId: parsed.data.quoteLineId ?? null,
    type: parsed.data.type,
    message: parsed.data.message ?? null,
    counterDiscountPct:
      parsed.data.counterDiscountPct != null ? String(parsed.data.counterDiscountPct) : null,
    requestedDeliveryDate: parsed.data.requestedDeliveryDate
      ? new Date(parsed.data.requestedDeliveryDate)
      : null,
  })
  await db
    .update(quotations)
    .set({ status: 'under_negotiation', updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, q.id))
  await db.insert(auditLog).values({
    quotationId: q.id,
    action: `customer_${parsed.data.type}`,
    detail: {
      message: parsed.data.message,
      counterDiscountPct: parsed.data.counterDiscountPct,
      requestedDeliveryDate: parsed.data.requestedDeliveryDate,
    },
  })
  res.json({ ok: true })
}

// Confirm: apply any counter discount, then decide whether the deal still has a
// valid sign-off.
//
// A quote can only be sent once it is approved, and it is locked against rep
// edits from then on — so the ONLY thing that can move the terms after that is
// the customer's own counter-offer. §5 is explicit that it is a CHANGE that
// re-opens the chain: "if terms change beyond thresholds during negotiation, the
// quote re-enters the approval flow automatically".
//
// Re-scoring unconditionally therefore bounced every discounted deal straight
// back to the manager who had just signed it off, for a decision they had
// already made on exactly these numbers. Only a counter re-opens the chain.
export async function confirmPortal(req: Request<{ token: string }>, res: Response) {
  const q = await findByToken(req.params.token)
  if (!q) return res.status(404).json({ error: 'invalid link' })

  if (!OPEN_TO_CUSTOMER.includes(q.status))
    return res.status(400).json({ error: closedMsg(q.status) })

  // apply the largest open counter-discount as the order discount
  const openCounters = await db
    .select()
    .from(negotiationRequests)
    .where(eq(negotiationRequests.quotationId, q.id))
  const counters = openCounters.filter(
    (n) => n.type === 'counter_discount' && n.counterDiscountPct != null && n.status === 'open',
  )
  // did the customer actually move the terms?
  const termsChanged =
    counters.length > 0 &&
    Math.max(...counters.map((c) => Number(c.counterDiscountPct))) !== Number(q.orderDiscountPct)

  if (counters.length) {
    const maxCounter = Math.max(...counters.map((c) => Number(c.counterDiscountPct)))
    await db.update(quotations).set({ orderDiscountPct: String(maxCounter) }).where(eq(quotations.id, q.id))
    await db
      .update(negotiationRequests)
      .set({ status: 'addressed' })
      .where(eq(negotiationRequests.quotationId, q.id))
  }

  const risk = await scoreQuotation(q.id)
  // the sign-off the quote already carries still stands unless the customer moved
  // the numbers out from under it
  const needsApproval = termsChanged && !!risk && risk.level !== 'none'
  const status = needsApproval ? 'pending_approval' : 'confirmed'

  await db
    .update(quotations)
    .set({
      status,
      riskScore: risk ? String(risk.score) : q.riskScore,
      requiresManager: risk?.requiresManager ?? false,
      requiresFinance: risk?.requiresFinance ?? false,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(eq(quotations.id, q.id))

  if (needsApproval && risk) {
    await db.delete(approvals).where(eq(approvals.quotationId, q.id))
    if (risk.requiresManager) await db.insert(approvals).values({ quotationId: q.id, step: 'manager' })
    if (risk.requiresFinance) await db.insert(approvals).values({ quotationId: q.id, step: 'finance' })
  }
  await db.insert(auditLog).values({
    quotationId: q.id,
    action: needsApproval ? 'customer_confirm_reapproval' : 'customer_confirmed',
    detail: { score: risk?.score, level: risk?.level },
  })

  res.json({ status, reEnteredApproval: needsApproval, risk })
}
