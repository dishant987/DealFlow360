import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { hashPassword } from '../utils/token.js'
import { num } from '../utils/crud.js'
import {
  stock,
  warehouses,
  products,
  appSettings,
  users,
  productPairings,
  productVariants,
} from '../models/schema.js'
import { alias } from 'drizzle-orm/pg-core'

/* ---- stock: joined list + upsert by (warehouse, product) ---- */
export async function listStock(_req: Request, res: Response) {
  const rows = await db
    .select({
      id: stock.id,
      warehouseId: stock.warehouseId,
      warehouse: warehouses.name,
      productId: stock.productId,
      product: products.name,
      quantity: stock.quantity,
      reorderLevel: stock.reorderLevel,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .innerJoin(products, eq(stock.productId, products.id))
  res.json(rows)
}

const stockSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().nonnegative(),
  reorderLevel: z.number().int().nonnegative().optional(),
})
export async function upsertStock(req: Request, res: Response) {
  const p = stockSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [row] = await db
    .insert(stock)
    .values(p.data)
    .onConflictDoUpdate({
      target: [stock.warehouseId, stock.productId],
      set: { quantity: p.data.quantity, reorderLevel: p.data.reorderLevel ?? 0 },
    })
    .returning()
  res.status(201).json(row)
}
export async function deleteStock(req: Request<{ id: string }>, res: Response) {
  const [row] = await db.delete(stock).where(eq(stock.id, req.params.id)).returning()
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
}

/* ---- upsell pairings: joined list so the UI shows product names, not uuids ---- */
export async function listPairings(_req: Request, res: Response) {
  const suggested = alias(products, 'suggested')
  res.json(
    await db
      .select({
        id: productPairings.id,
        productId: productPairings.productId,
        product: products.name,
        suggestedProductId: productPairings.suggestedProductId,
        suggested: suggested.name,
        score: productPairings.score,
      })
      .from(productPairings)
      .innerJoin(products, eq(productPairings.productId, products.id))
      .innerJoin(suggested, eq(productPairings.suggestedProductId, suggested.id)),
  )
}

/* ---- product variants (A2): joined list ---- */
export async function listVariants(_req: Request, res: Response) {
  res.json(
    await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        product: products.name,
        attribute: productVariants.attribute,
        value: productVariants.value,
        extraPrice: productVariants.extraPrice,
        sku: productVariants.sku,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id)),
  )
}

/* ---- app settings (singleton row) ---- */
export async function getSettings(_req: Request, res: Response) {
  const [row] = await db.select().from(appSettings).limit(1)
  res.json(row ?? null)
}
const settingsSchema = z
  .object({
    managerThreshold: num,
    financeThreshold: num,
    minUpsellMarginPct: num,
    stalledDays: z.number().int().positive(),
  })
  .partial()
export async function updateSettings(req: Request, res: Response) {
  const p = settingsSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [row] = await db.update(appSettings).set(p.data).returning() // singleton → updates the one row
  res.json(row ?? null)
}

/* ---- user management (admin creates manager/finance/admin) ---- */
const roleEnum = z.enum(['rep', 'manager', 'finance', 'admin'])
export async function listUsers(_req: Request, res: Response) {
  res.json(
    await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users),
  )
}
export async function createUser(req: Request, res: Response) {
  const p = z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: roleEnum,
    })
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const existing = await db.select().from(users).where(eq(users.email, p.data.email))
  if (existing.length) return res.status(409).json({ error: 'email already registered' })
  const [u] = await db
    .insert(users)
    .values({
      name: p.data.name,
      email: p.data.email,
      passwordHash: await hashPassword(p.data.password),
      role: p.data.role,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
  res.status(201).json(u)
}
export async function updateUser(req: Request<{ id: string }>, res: Response) {
  const p = z.object({ role: roleEnum, name: z.string().min(1) }).partial().safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const [u] = await db
    .update(users)
    .set(p.data)
    .where(eq(users.id, req.params.id))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json(u)
}
export async function deleteUser(req: Request<{ id: string }>, res: Response) {
  const [u] = await db.delete(users).where(eq(users.id, req.params.id)).returning()
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
}
