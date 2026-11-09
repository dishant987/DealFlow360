import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../config/db.js'
import { contacts, customers, users } from '../models/schema.js'

/*
 * Customer ownership. Reps own the customers they create and may edit only
 * those; managers and admins edit any and can reassign. The rule is pure so it
 * is unit-tested; customerAccess adds the database lookups.
 */
type Rule = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }
export function customerWriteRule(
  user: { id: string; role: string },
  method: string,
  body: Record<string, unknown>,
  ownerId?: string | null, // current owner, for PATCH
): Rule {
  if (user.role !== 'rep') return { ok: true, body }
  if (method === 'POST') return { ok: true, body: { ...body, tier: 'bronze', ownerId: user.id } }
  if (body.tier !== undefined) return { ok: false, status: 403, error: "Only a manager or admin can change a customer's tier." }
  if (body.ownerId !== undefined) return { ok: false, status: 403, error: 'Only a manager or admin can reassign a customer.' }
  if (ownerId !== user.id) return { ok: false, status: 403, error: 'You can only edit customers you own.' }
  return { ok: true, body }
}

/** users aren't under RLS, so an owner id from a client must be checked against the company. */
async function inCompany(userId: unknown, orgId: string | undefined) {
  if (typeof userId !== 'string') return false
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId!)))
  return !!u
}

async function ownerOf(customerId: string) {
  const [c] = await db.select({ ownerId: customers.ownerId }).from(customers).where(eq(customers.id, customerId))
  return c ? c.ownerId : undefined
}

/** Middleware in front of the generic customer CRUD (POST / PATCH /:id). */
export async function customerAccess(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' && req.method !== 'PATCH') return next()
  const id = req.method === 'PATCH' ? req.path.split('/')[1] : undefined
  const owner = id ? await ownerOf(id) : undefined
  if (id && owner === undefined) return res.status(404).json({ error: 'not found' })
  const r = customerWriteRule(req.user!, req.method, req.body ?? {}, owner)
  if (!r.ok) return res.status(r.status).json({ error: r.error })
  if (r.body.ownerId != null && !(await inCompany(r.body.ownerId, req.orgId)))
    return res.status(400).json({ error: 'The owner must be a user in your company.' })
  req.body = r.body
  next()
}

/** One customer with its owner and contacts (quotes come from the scoped /quotations list). */
export async function getCustomer(req: Request<{ id: string }>, res: Response) {
  const [c] = await db
    .select({ customer: customers, ownerName: users.name })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.ownerId))
    .where(eq(customers.id, req.params.id))
  if (!c) return res.status(404).json({ error: 'not found' })
  const people = await db.select().from(contacts).where(eq(contacts.customerId, req.params.id)).orderBy(contacts.name)
  res.json({ ...c.customer, ownerName: c.ownerName, contacts: people })
}

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email().or(z.literal('')).optional(),
  phone: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(80).optional(),
  isPrimary: z.boolean().optional(),
})

/** Contacts follow the customer's ownership rule. */
async function canEditCustomer(req: Request, customerId: string) {
  if (req.user!.role !== 'rep') return true
  return (await ownerOf(customerId)) === req.user!.id
}

/** Only one primary contact per customer. */
async function clearOtherPrimaries(customerId: string, keepId: string) {
  await db
    .update(contacts)
    .set({ isPrimary: false })
    .where(and(eq(contacts.customerId, customerId), ne(contacts.id, keepId)))
}

export async function addContact(req: Request<{ id: string }>, res: Response) {
  if ((await ownerOf(req.params.id)) === undefined) return res.status(404).json({ error: 'not found' })
  if (!(await canEditCustomer(req, req.params.id))) return res.status(403).json({ error: 'You can only edit customers you own.' })
  const p = contactSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [row] = await db
    .insert(contacts)
    .values({ ...p.data, email: p.data.email || null, customerId: req.params.id })
    .returning()
  if (row.isPrimary) await clearOtherPrimaries(row.customerId, row.id)
  res.status(201).json(row)
}

export async function updateContact(req: Request<{ id: string }>, res: Response) {
  const [existing] = await db.select().from(contacts).where(eq(contacts.id, req.params.id))
  if (!existing) return res.status(404).json({ error: 'not found' })
  if (!(await canEditCustomer(req, existing.customerId))) return res.status(403).json({ error: 'You can only edit customers you own.' })
  const p = contactSchema.partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const patch = { ...p.data, ...(p.data.email !== undefined ? { email: p.data.email || null } : {}) }
  const [row] = await db.update(contacts).set(patch).where(eq(contacts.id, req.params.id)).returning()
  if (row.isPrimary) await clearOtherPrimaries(row.customerId, row.id)
  res.json(row)
}

export async function deleteContact(req: Request<{ id: string }>, res: Response) {
  const [existing] = await db.select().from(contacts).where(eq(contacts.id, req.params.id))
  if (!existing) return res.status(404).json({ error: 'not found' })
  if (!(await canEditCustomer(req, existing.customerId))) return res.status(403).json({ error: 'You can only edit customers you own.' })
  await db.delete(contacts).where(eq(contacts.id, req.params.id))
  res.json({ ok: true })
}

/** Where a quote's portal link goes: the primary contact if set, else the customer's own email. */
export async function quoteRecipient(customerId: string) {
  const [primary] = await db
    .select({ email: contacts.email, name: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.customerId, customerId), eq(contacts.isPrimary, true)))
  return primary?.email ? primary : null
}
