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
} from '../models/schema.js'
import { computeQuoteTotals } from '../services/pricing.js'
import { computeBlendedRisk } from '../services/risk.js'

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
    .select({ discountPct: quoteLines.discountPct, categoryId: products.categoryId })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(eq(quoteLines.quotationId, quotationId))

  const [tierRow] = await db.select().from(discountTiers).where(eq(discountTiers.tier, q.tier))
  const tierCeiling = tierRow ? Number(tierRow.maxDiscountPct) : 100
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
  return computeBlendedRisk(riskLines, thresholds)
}

/* ---- list: quote + customer name + computed total ---- */
export async function listQuotations(_req: Request, res: Response) {
  const quotes = await db
    .select({
      id: quotations.id,
      status: quotations.status,
      customerId: quotations.customerId,
      customer: customers.name,
      orderDiscountPct: quotations.orderDiscountPct,
      riskScore: quotations.riskScore,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))

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
      amount: computeQuoteTotals(byQuote.get(q.id) ?? [], q.orderDiscountPct).total,
    })),
  )
}

/* ---- detail: quote + customer + lines + totals ---- */
export async function getQuotation(req: Request<{ id: string }>, res: Response) {
  const [quote] = await db
    .select({
      id: quotations.id,
      status: quotations.status,
      customerId: quotations.customerId,
      customer: customers.name,
      customerTier: customers.tier,
      repId: quotations.repId,
      orderDiscountPct: quotations.orderDiscountPct,
      riskScore: quotations.riskScore,
      requiresManager: quotations.requiresManager,
      requiresFinance: quotations.requiresFinance,
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
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
      subscriptionPlanId: quoteLines.subscriptionPlanId,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(eq(quoteLines.quotationId, req.params.id))

  const risk = await scoreQuotation(req.params.id)
  res.json({ ...quote, lines, totals: computeQuoteTotals(lines, quote.orderDiscountPct), risk })
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
  res.status(201).json(q)
}

async function touch(quotationId: string) {
  await db
    .update(quotations)
    .set({ updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, quotationId))
}

/* ---- add a line (snapshots tier price + cost) ---- */
export async function addLine(req: Request<{ id: string }>, res: Response) {
  const p = z
    .object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive().optional(),
      discountPct: z.union([z.number(), z.string()]).optional(),
    })
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })

  const [quote] = await db
    .select({ id: quotations.id, tier: customers.tier })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, req.params.id))
  if (!quote) return res.status(404).json({ error: 'quotation not found' })

  const [product] = await db.select().from(products).where(eq(products.id, p.data.productId))
  if (!product) return res.status(400).json({ error: 'product not found' })

  // tier price override if present, else base price
  const [tierPrice] = await db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.productId, product.id), eq(priceListItems.tier, quote.tier)))
  const unitPrice = tierPrice?.unitPrice ?? product.unitPrice

  const [line] = await db
    .insert(quoteLines)
    .values({
      quotationId: quote.id,
      productId: product.id,
      quantity: p.data.quantity ?? 1,
      unitPrice,
      unitCost: product.unitCost,
      discountPct: p.data.discountPct != null ? String(p.data.discountPct) : '0',
      lineType: product.type,
      subscriptionPlanId: product.subscriptionPlanId,
    })
    .returning()
  await touch(quote.id)
  res.status(201).json(line)
}

/* ---- update a line ---- */
export async function updateLine(req: Request<{ id: string; lineId: string }>, res: Response) {
  const p = z
    .object({
      quantity: z.number().int().positive(),
      discountPct: z.union([z.number(), z.string()]).transform(String),
    })
    .partial()
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [line] = await db
    .update(quoteLines)
    .set(p.data)
    .where(and(eq(quoteLines.id, req.params.lineId), eq(quoteLines.quotationId, req.params.id)))
    .returning()
  if (!line) return res.status(404).json({ error: 'not found' })
  await touch(req.params.id)
  res.json(line)
}

/* ---- delete a line ---- */
export async function deleteLine(req: Request<{ id: string; lineId: string }>, res: Response) {
  const [line] = await db
    .delete(quoteLines)
    .where(and(eq(quoteLines.id, req.params.lineId), eq(quoteLines.quotationId, req.params.id)))
    .returning()
  if (!line) return res.status(404).json({ error: 'not found' })
  await touch(req.params.id)
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
  const token = crypto.randomBytes(24).toString('hex')
  const [q] = await db
    .update(quotations)
    .set({ portalToken: token, status: 'sent', updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()
  if (!q) return res.status(404).json({ error: 'not found' })
  await db.insert(auditLog).values({
    quotationId: q.id,
    userId: req.user!.id,
    action: 'sent_to_customer',
  })
  res.json({ portalToken: token, portalUrl: `${CLIENT_URL}/portal/${token}` })
}

/* ---- rep view of customer negotiation requests ---- */
export async function listNegotiations(req: Request<{ id: string }>, res: Response) {
  res.json(
    await db
      .select()
      .from(negotiationRequests)
      .where(eq(negotiationRequests.quotationId, req.params.id)),
  )
}

/* ---- update quote (order-level discount) ---- */
export async function updateQuotation(req: Request<{ id: string }>, res: Response) {
  const p = z
    .object({ orderDiscountPct: z.union([z.number(), z.string()]).transform(String) })
    .partial()
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [q] = await db
    .update(quotations)
    .set({ ...p.data, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()
  if (!q) return res.status(404).json({ error: 'not found' })
  res.json(q)
}
