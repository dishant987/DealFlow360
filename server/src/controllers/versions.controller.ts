import type { Request, Response } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { contacts, customers, productVariants, products, quotations, quoteLines, quoteVersions, users } from '../models/schema.js'
import { computeQuoteTotals } from '../services/pricing.js'
import { quoteNumber } from '../services/quoteNumber.js'
import { compareVersions, versionHash, type Snapshot } from '../services/quoteVersion.js'
import { orgCurrency } from '../utils/format.js'

type Quote = typeof quotations.$inferSelect

/** The quote as the customer sees it — the portal page and every saved version use this. No cost or margin. */
export async function customerView(q: Quote, orgId?: string): Promise<Snapshot> {
  const [customer] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, q.customerId))
  const lines = await db
    .select({
      id: quoteLines.id,
      product: products.name,
      variantAttribute: productVariants.attribute,
      variantValue: productVariants.value,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost, // only for the totals below, never returned
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .leftJoin(productVariants, eq(quoteLines.variantId, productVariants.id))
    .where(eq(quoteLines.quotationId, q.id))
  const totals = computeQuoteTotals(lines, q.orderDiscountPct)
  const contactName = q.contactId
    ? ((await db.select({ n: contacts.name }).from(contacts).where(eq(contacts.id, q.contactId)))[0]?.n ?? null)
    : null
  return {
    quoteNumber: quoteNumber(q.seqNo, q.createdAt),
    customer: customer?.name ?? null,
    currency: await orgCurrency(orgId),
    validUntil: q.validUntil ? q.validUntil.toISOString() : null,
    contactName,
    customerPo: q.customerPo,
    paymentTermsDays: q.paymentTermsDays,
    notesToCustomer: q.notesToCustomer,
    terms: q.terms,
    orderDiscountPct: q.orderDiscountPct,
    // the variant is part of WHAT is being bought and can carry its own price
    lines: lines.map(({ unitCost: _c, ...l }) => l),
    subtotal: totals.subtotal,
    total: totals.total,
  }
}

const latest = async (quotationId: string) =>
  (await db.select().from(quoteVersions).where(eq(quoteVersions.quotationId, quotationId)).orderBy(desc(quoteVersions.version)).limit(1))[0]

/** Freeze what the customer sees now. Unchanged content reuses the latest version instead of adding a duplicate. */
export async function saveVersion(q: Quote, orgId: string | undefined, createdBy: string | null) {
  const snapshot = await customerView(q, orgId)
  const hash = versionHash(snapshot)
  const last = await latest(q.id)
  if (last?.hash === hash) return last
  const [v] = await db
    .insert(quoteVersions)
    .values({ quotationId: q.id, version: (last?.version ?? 0) + 1, snapshot, hash, createdBy })
    .returning()
  return v
}

/** Latest version number and the customer's signature, for the portal and the quote page. */
export async function versionInfo(quotationId: string) {
  const rows = await db
    .select({ version: quoteVersions.version, signedName: quoteVersions.signedName, signedAt: quoteVersions.signedAt })
    .from(quoteVersions)
    .where(eq(quoteVersions.quotationId, quotationId))
    .orderBy(desc(quoteVersions.version))
  const signed = rows.find((r) => r.signedAt)
  return {
    version: rows[0]?.version ?? null,
    signature: signed ? { name: signed.signedName, at: signed.signedAt, version: signed.version } : null,
  }
}

/* ---- internal endpoints (quotation router; reps are scoped by quotationAccessParam) ---- */

export async function listVersions(req: Request<{ id: string }>, res: Response) {
  const rows = await db
    .select({
      version: quoteVersions.version,
      createdAt: quoteVersions.createdAt,
      createdBy: users.name,
      hash: quoteVersions.hash,
      snapshot: quoteVersions.snapshot,
      signedName: quoteVersions.signedName,
      signedAt: quoteVersions.signedAt,
      signedIp: quoteVersions.signedIp,
      signedUserAgent: quoteVersions.signedUserAgent,
    })
    .from(quoteVersions)
    .leftJoin(users, eq(users.id, quoteVersions.createdBy))
    .where(eq(quoteVersions.quotationId, req.params.id))
    .orderBy(desc(quoteVersions.version))
  res.json(rows.map(({ snapshot, ...r }) => ({ ...r, total: (snapshot as Snapshot).total, lines: (snapshot as Snapshot).lines.length })))
}

export async function getVersion(req: Request<{ id: string; version: string }>, res: Response) {
  const [v] = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.quotationId, req.params.id), eq(quoteVersions.version, Number(req.params.version) || 0)))
  if (!v) return res.status(404).json({ error: 'not found' })
  res.json(v)
}

export async function compareQuoteVersions(req: Request<{ id: string }>, res: Response) {
  const from = Number(req.query.from)
  const to = Number(req.query.to)
  if (!Number.isInteger(from) || !Number.isInteger(to)) return res.status(400).json({ error: 'Pick two versions to compare.' })
  const pick = async (n: number) =>
    (await db.select().from(quoteVersions).where(and(eq(quoteVersions.quotationId, req.params.id), eq(quoteVersions.version, n))))[0]
  const [a, b] = await Promise.all([pick(from), pick(to)])
  if (!a || !b) return res.status(404).json({ error: 'not found' })
  res.json({ from, to, ...compareVersions(a.snapshot as Snapshot, b.snapshot as Snapshot) })
}
