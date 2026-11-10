import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { NextFunction } from 'express'
import { db, runInTenant, scopeRequest } from '../config/db.js'
import {
  quotations,
  quoteLines,
  products,
  productVariants,
  customers,
  negotiationRequests,
  approvals,
  auditLog, quoteVersions } from '../models/schema.js'
import { contacts } from '../models/schema.js'
import { computeQuoteTotals } from '../services/pricing.js'
import { scoreQuotation } from './quotation.controller.js'
import { quoteNumber } from '../services/quoteNumber.js'
import { orgCurrency } from '../utils/format.js'
import { customerView, saveVersion, versionInfo } from './versions.controller.js'

// the customer may only act while the quote is genuinely open to them
const OPEN_TO_CUSTOMER = ['sent', 'under_negotiation']
const closedMsg = (status: string) =>
  status === 'confirmed'
    ? 'You have already confirmed this quotation.'
    : `This quotation is ${status.replace(/_/g, ' ')} and is no longer open for changes.`

// Resolve a quote by its portal token. Returns null if not found.
/** router.param('token'): find which company the link belongs to, then run the request as that company. */
export function portalScope(req: Request, res: Response, next: NextFunction, token: string) {
  // the customer isn't signed in, so this one lookup crosses companies (internal bypass)
  runInTenant(
    null,
    async () =>
      (await db.select({ org: quotations.organizationId }).from(quotations).where(eq(quotations.portalToken, String(token))))[0]?.org,
    { bypass: true },
  )
    .then((org) => {
      if (!org) return res.status(404).json({ error: 'invalid link' })
      req.orgId = org
      scopeRequest(org, res, next)
    })
    .catch(next)
}

/** A quote with no valid-until date (made before step 12) never expires. */
export const quoteExpired = (validUntil: Date | null, now = new Date()) => !!validUntil && validUntil < now

/** A link with no expiry counts as expired (fail closed). */
export const portalLinkLive = (expiresAt: Date | null, now = new Date()) => !!expiresAt && expiresAt > now

// An expired link reads exactly like an unknown one; re-sending issues a fresh link.
async function findByToken(token: string) {
  const [q] = await db.select().from(quotations).where(eq(quotations.portalToken, token))
  return q && portalLinkLive(q.portalTokenExpiresAt) ? q : null
}

// Customer-safe projection: NO cost/margin ever leaves the server.
export async function getPortalQuote(req: Request<{ token: string }>, res: Response) {
  const q = await findByToken(req.params.token)
  if (!q) return res.status(404).json({ error: 'invalid link' })
  const negotiations = await db
    .select()
    .from(negotiationRequests)
    .where(eq(negotiationRequests.quotationId, q.id))
  // the same customer-facing view every saved version freezes (no cost, no internal notes)
  res.json({
    ...(await customerView(q, req.orgId)),
    status: q.status,
    expired: quoteExpired(q.validUntil),
    negotiations,
    ...(await versionInfo(q.id)),
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
// Typed signature: the customer's full name plus an explicit "I agree".
const signSchema = z.object({ signerName: z.string().trim().min(2).max(120), agree: z.literal(true) })

export async function confirmPortal(req: Request<{ token: string }>, res: Response) {
  const q = await findByToken(req.params.token)
  if (!q) return res.status(404).json({ error: 'invalid link' })

  if (!OPEN_TO_CUSTOMER.includes(q.status))
    return res.status(400).json({ error: closedMsg(q.status) })
  if (quoteExpired(q.validUntil))
    return res.status(400).json({
      error: `This quotation expired on ${q.validUntil!.toDateString()}. Please ask for an updated quote.`,
    })

  // after the status/expiry checks, so a closed quote still explains itself
  const sign = signSchema.safeParse(req.body)
  if (!sign.success) return res.status(400).json({ error: 'Type your full name and tick “I agree” to sign.' })

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

  // freeze exactly what is being accepted (after any counter-discount) and sign that version
  const [now] = await db.select().from(quotations).where(eq(quotations.id, q.id))
  const signed = await saveVersion(now, req.orgId, null)
  await db
    .update(quoteVersions)
    .set({
      signedName: sign.data.signerName,
      signedAt: new Date(),
      signedIp: req.ip ?? null,
      signedUserAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    })
    .where(eq(quoteVersions.id, signed.id))

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
    detail: { score: risk?.score, level: risk?.level, signedBy: sign.data.signerName, version: signed.version },
  })

  res.json({ status, reEnteredApproval: needsApproval, risk, version: signed.version })
}
