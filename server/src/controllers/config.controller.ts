import type { Request, Response } from 'express'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
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
  quoteLines,
  fulfillmentAllocations,
  categoryDiscountCeilings,
  categories,
  auditLog,
  quotations,
  customers,
} from '../models/schema.js'
import { quoteNumber } from '../services/quoteNumber.js'
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

/* ---- products with category + stock rolled up per warehouse ---- */
export async function listProductsAdmin(_req: Request, res: Response) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: products.categoryId,
      category: categories.name,
      type: products.type,
      unitPrice: products.unitPrice,
      unitCost: products.unitCost,
      unit: products.unit,
      taxRate: products.taxRate,
      description: products.description,
      subscriptionPlanId: products.subscriptionPlanId,
      isPromoted: products.isPromoted,
      active: products.active,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))

  const stocks = await db
    .select({
      productId: stock.productId,
      warehouse: warehouses.name,
      quantity: stock.quantity,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))

  res.json(
    rows.map((p) => {
      const mine = stocks.filter((s) => s.productId === p.id)
      return {
        ...p,
        stock: mine.length ? mine.reduce((n, s) => n + s.quantity, 0) : null,
        stockByWarehouse: mine.length
          ? mine.map((s) => `${s.warehouse} ${s.quantity}`).join(' · ')
          : '—',
      }
    }),
  )
}

/* ---- per-product stock detail: on hand, allocated, backordered + movement history ---- */
export async function productStockDetail(req: Request<{ id: string }>, res: Response) {
  const [product] = await db.select().from(products).where(eq(products.id, req.params.id))
  if (!product) return res.status(404).json({ error: 'not found' })

  const onHand = await db
    .select({
      warehouseId: stock.warehouseId,
      warehouse: warehouses.name,
      quantity: stock.quantity,
      reorderLevel: stock.reorderLevel,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .where(eq(stock.productId, req.params.id))

  // every allocation ever made for this product = its outbound movement history
  const history = await db
    .select({
      id: fulfillmentAllocations.id,
      createdAt: fulfillmentAllocations.createdAt,
      quantity: fulfillmentAllocations.quantity,
      backordered: fulfillmentAllocations.backordered,
      warehouse: warehouses.name,
      warehouseId: fulfillmentAllocations.warehouseId,
      quotationId: fulfillmentAllocations.quotationId,
      seqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      customer: customers.name,
      status: quotations.status,
    })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .innerJoin(quotations, eq(fulfillmentAllocations.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(warehouses, eq(fulfillmentAllocations.warehouseId, warehouses.id))
    .where(eq(quoteLines.productId, req.params.id))
    .orderBy(desc(fulfillmentAllocations.createdAt))

  const allocatedByWarehouse = new Map<string, number>()
  let backordered = 0
  for (const h of history) {
    if (h.backordered) backordered += h.quantity
    else if (h.warehouseId)
      allocatedByWarehouse.set(
        h.warehouseId,
        (allocatedByWarehouse.get(h.warehouseId) ?? 0) + h.quantity,
      )
  }

  res.json({
    product: { id: product.id, name: product.name, sku: product.sku },
    warehouses: onHand.map((w) => ({
      ...w,
      allocated: allocatedByWarehouse.get(w.warehouseId) ?? 0,
      belowReorder: w.quantity <= w.reorderLevel,
    })),
    totals: {
      onHand: onHand.reduce((n, w) => n + w.quantity, 0),
      allocated: [...allocatedByWarehouse.values()].reduce((n, v) => n + v, 0),
      backordered,
    },
    history: history.map((h) => ({
      id: h.id,
      createdAt: h.createdAt,
      quantity: h.quantity,
      backordered: h.backordered,
      warehouse: h.warehouse ?? 'Backorder',
      customer: h.customer,
      status: h.status,
      quotationId: h.quotationId,
      quoteNumber: quoteNumber(h.seqNo, h.quoteCreatedAt),
    })),
  })
}

/* ---- category ceilings: joined so the UI shows the category name, not a uuid ---- */
export async function listCeilings(_req: Request, res: Response) {
  res.json(
    await db
      .select({
        id: categoryDiscountCeilings.id,
        categoryId: categoryDiscountCeilings.categoryId,
        category: categories.name,
        maxDiscountPct: categoryDiscountCeilings.maxDiscountPct,
      })
      .from(categoryDiscountCeilings)
      .innerJoin(categories, eq(categoryDiscountCeilings.categoryId, categories.id)),
  )
}

/* ---- audit trail (A3): who did what, when, and why ---- */
export async function listAudit(_req: Request, res: Response) {
  const rows = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      user: users.name,
      reason: auditLog.reason,
      detail: auditLog.detail,
      quotationId: auditLog.quotationId,
      seqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      customer: customers.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .leftJoin(quotations, eq(auditLog.quotationId, quotations.id))
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(500)

  res.json(
    rows.map((r) => ({
      ...r,
      quoteNumber: r.seqNo ? quoteNumber(r.seqNo, r.quoteCreatedAt!) : '',
      user: r.user ?? 'customer (portal)',
      detail: r.detail ? JSON.stringify(r.detail) : '',
    })),
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
  const p = z
    .object({
      role: roleEnum,
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6), // optional admin password reset
    })
    .partial()
    .safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const { password, ...rest } = p.data
  const patch = password ? { ...rest, passwordHash: await hashPassword(password) } : rest
  const [u] = await db
    .update(users)
    .set(patch)
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
