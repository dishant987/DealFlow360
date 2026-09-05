import type { Request, Response } from 'express'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  quoteLines,
  products,
  warehouses,
  stock,
  fulfillmentAllocations,
  auditLog,
} from '../models/schema.js'
import { splitLine, shipmentCount, type WhStock } from '../services/fulfillment.js'
import { replenishmentPlan } from '../services/replenishment.js'

// stock may only move once the deal has cleared approval (or the customer confirmed)
const FULFILLABLE = ['approved', 'confirmed', 'fulfilled', 'invoiced']
const notFulfillable = (status: string) =>
  `This quotation is ${status.replace(/_/g, ' ')} — it must be approved before stock can be allocated.`

interface SuggestionLine {
  lineId: string
  product: string
  needed: number
  options: { warehouseId: string; warehouse: string; available: number; weight: number; suggested: number }[]
  backordered: number
}

// Build the recommended split for every stockable line (lines with no stock are non-physical → skipped).
async function computeSuggestion(quotationId: string): Promise<SuggestionLine[]> {
  const lines = await db
    .select({
      lineId: quoteLines.id,
      productId: quoteLines.productId,
      product: products.name,
      quantity: quoteLines.quantity,
    })
    .from(quoteLines)
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .where(eq(quoteLines.quotationId, quotationId))

  const out: SuggestionLine[] = []
  for (const l of lines) {
    const stocks = await db
      .select({
        warehouseId: stock.warehouseId,
        warehouse: warehouses.name,
        quantity: stock.quantity,
        weight: warehouses.shippingCostWeight,
      })
      .from(stock)
      .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
      .where(eq(stock.productId, l.productId))
    if (stocks.length === 0) continue // non-physical line

    const whStocks: WhStock[] = stocks.map((s) => ({
      warehouseId: s.warehouseId,
      quantity: s.quantity,
      weight: Number(s.weight),
    }))
    const split = splitLine(l.quantity, whStocks)
    const allocFor = (id: string) =>
      split.allocations.find((a) => a.warehouseId === id)?.quantity ?? 0

    out.push({
      lineId: l.lineId,
      product: l.product,
      needed: l.quantity,
      options: stocks.map((s) => ({
        warehouseId: s.warehouseId,
        warehouse: s.warehouse,
        available: s.quantity,
        weight: Number(s.weight),
        suggested: allocFor(s.warehouseId),
      })),
      backordered: split.backordered,
    })
  }
  return out
}

export async function getSuggestion(req: Request<{ id: string }>, res: Response) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!q) return res.status(404).json({ error: 'not found' })
  const lines = await computeSuggestion(req.params.id)
  const allAllocs = lines.flatMap((l) =>
    l.options.filter((o) => o.suggested > 0).map((o) => ({ warehouseId: o.warehouseId, quantity: o.suggested })),
  )
  const usedWeights = new Map(
    lines.flatMap((l) => l.options).map((o) => [o.warehouseId, o.weight]),
  )
  const shipments = shipmentCount(allAllocs)
  const estimatedShippingCost = [...new Set(allAllocs.map((a) => a.warehouseId))].reduce(
    (sum, id) => sum + (usedWeights.get(id) ?? 0),
    0,
  )

  // B6: has stock arrived since we backordered? drives the automatic consolidate prompt
  const backorders = await db
    .select({ productId: quoteLines.productId, quantity: fulfillmentAllocations.quantity })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .where(
      and(
        eq(fulfillmentAllocations.quotationId, req.params.id),
        eq(fulfillmentAllocations.backordered, true),
      ),
    )
  let consolidatable = 0
  for (const b of backorders) {
    if (b.quantity <= 0) continue
    const rows = await db.select().from(stock).where(eq(stock.productId, b.productId))
    const available = rows.reduce((s, r) => s + r.quantity, 0)
    consolidatable += Math.min(available, b.quantity)
  }

  res.json({
    status: q.status,
    lines,
    shipmentCount: shipments,
    estimatedShippingCost,
    consolidatable, // units now fulfillable from stock that has since arrived
  })
}

const acceptSchema = z.object({
  allocations: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
})

export async function acceptSplit(req: Request<{ id: string }>, res: Response) {
  const parsed = acceptSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [q] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!q) return res.status(404).json({ error: 'not found' })
  if (!FULFILLABLE.includes(q.status))
    return res.status(400).json({ error: notFulfillable(q.status) })

  // manual override, or fall back to the computed suggestion
  let allocations = parsed.data.allocations
  if (!allocations) {
    const suggestion = await computeSuggestion(req.params.id)
    allocations = suggestion.flatMap((l) =>
      l.options
        .filter((o) => o.suggested > 0)
        .map((o) => ({ lineId: l.lineId, warehouseId: o.warehouseId, quantity: o.suggested })),
    )
  }

  // needed-per-line to compute backorders
  const lineRows = await db
    .select({ id: quoteLines.id, productId: quoteLines.productId, quantity: quoteLines.quantity })
    .from(quoteLines)
    .where(eq(quoteLines.quotationId, req.params.id))
  const neededByLine = new Map(lineRows.map((l) => [l.id, l.quantity]))
  const productByLine = new Map(lineRows.map((l) => [l.id, l.productId]))

  // Only stock-tracked products can be backordered. Services and subscriptions
  // have no warehouse rows at all — they are not fulfilled from stock, so they
  // must never appear as a shortfall.
  const stockedProducts = new Set(
    (await db.selectDistinct({ productId: stock.productId }).from(stock)).map((r) => r.productId),
  )

  try {
    await db.transaction(async (tx) => {
      // restore stock from any previous allocations, then clear them (idempotent re-accept)
      const prev = await tx
        .select()
        .from(fulfillmentAllocations)
        .where(eq(fulfillmentAllocations.quotationId, req.params.id))
      for (const p of prev) {
        if (p.warehouseId) {
          await tx
            .update(stock)
            .set({ quantity: sql`${stock.quantity} + ${p.quantity}` })
            .where(
              and(
                eq(stock.warehouseId, p.warehouseId),
                eq(stock.productId, productByLine.get(p.quoteLineId)!),
              ),
            )
        }
      }
      await tx
        .delete(fulfillmentAllocations)
        .where(eq(fulfillmentAllocations.quotationId, req.params.id))

      // apply new allocations (validate + decrement)
      const allocatedByLine = new Map<string, number>()
      for (const a of allocations!) {
        const productId = productByLine.get(a.lineId)
        if (!productId) throw new Error('line not in quotation')
        const [s] = await tx
          .select()
          .from(stock)
          .where(and(eq(stock.warehouseId, a.warehouseId), eq(stock.productId, productId)))
        if (!s || s.quantity < a.quantity)
          throw new Error(`insufficient stock in warehouse for ${a.lineId}`)
        await tx
          .update(stock)
          .set({ quantity: sql`${stock.quantity} - ${a.quantity}` })
          .where(and(eq(stock.warehouseId, a.warehouseId), eq(stock.productId, productId)))
        await tx.insert(fulfillmentAllocations).values({
          quotationId: req.params.id,
          quoteLineId: a.lineId,
          warehouseId: a.warehouseId,
          quantity: a.quantity,
        })
        allocatedByLine.set(a.lineId, (allocatedByLine.get(a.lineId) ?? 0) + a.quantity)
      }

      // backorder rows for any shortfall on a STOCKED line
      for (const [lineId, needed] of neededByLine) {
        if (!stockedProducts.has(productByLine.get(lineId)!)) continue
        const short = needed - (allocatedByLine.get(lineId) ?? 0)
        if (short > 0)
          await tx.insert(fulfillmentAllocations).values({
            quotationId: req.params.id,
            quoteLineId: lineId,
            warehouseId: null,
            quantity: short,
            backordered: true,
          })
      }

      await tx
        .update(quotations)
        .set({ status: 'fulfilled', updatedAt: new Date(), lastActivityAt: new Date() })
        .where(eq(quotations.id, req.params.id))
      await tx.insert(auditLog).values({
        quotationId: req.params.id,
        userId: req.user!.id,
        action: 'fulfillment_accepted',
        detail: { allocations },
      })
    })
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message })
  }

  res.json(await currentAllocations(req.params.id))
}

// current allocations (with warehouse names) for display
async function currentAllocations(quotationId: string) {
  return db
    .select({
      id: fulfillmentAllocations.id,
      quoteLineId: fulfillmentAllocations.quoteLineId,
      product: products.name,
      warehouseId: fulfillmentAllocations.warehouseId,
      warehouse: warehouses.name,
      quantity: fulfillmentAllocations.quantity,
      backordered: fulfillmentAllocations.backordered,
    })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .leftJoin(warehouses, eq(fulfillmentAllocations.warehouseId, warehouses.id))
    .where(eq(fulfillmentAllocations.quotationId, quotationId))
}

export async function getAllocations(req: Request<{ id: string }>, res: Response) {
  res.json(await currentAllocations(req.params.id))
}

/* ---- A4: receive stock against a warehouse's replenishment rule ----
   Booking in a delivery is the action a reorder rule exists to trigger. Quantity
   is optional: without one we bring the location back up to its target. */
const receiveSchema = z.object({ quantity: z.number().int().positive().optional() })

export async function receiveStock(req: Request<{ stockId: string }>, res: Response) {
  const parsed = receiveSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [row] = await db
    .select({
      id: stock.id,
      quantity: stock.quantity,
      reorderLevel: stock.reorderLevel,
      targetLevel: stock.targetLevel,
      warehouse: warehouses.name,
      product: products.name,
      productId: stock.productId,
      warehouseId: stock.warehouseId,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .innerJoin(products, eq(stock.productId, products.id))
    .where(eq(stock.id, req.params.stockId))
  if (!row) return res.status(404).json({ error: 'stock record not found' })

  // reserved units are committed elsewhere, so they do not count as available
  const reservedRows = await db
    .select({ quantity: fulfillmentAllocations.quantity })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .innerJoin(quotations, eq(fulfillmentAllocations.quotationId, quotations.id))
    .where(
      and(
        eq(fulfillmentAllocations.warehouseId, row.warehouseId),
        eq(quoteLines.productId, row.productId),
        eq(fulfillmentAllocations.backordered, false),
        eq(quotations.status, 'fulfilled'),
      ),
    )
  const reserved = reservedRows.reduce((n, r) => n + r.quantity, 0)

  const [proposal] = replenishmentPlan([
    {
      stockId: row.id,
      warehouse: row.warehouse,
      product: row.product,
      // stock.quantity is already net of accepted allocations, so physical
      // on-hand is that plus whatever is reserved. Passing quantity straight in
      // would subtract the reserved units twice and over-order.
      onHand: row.quantity + reserved,
      reserved,
      reorderLevel: row.reorderLevel,
      targetLevel: row.targetLevel,
    },
  ])

  const quantity = parsed.data.quantity ?? proposal?.suggested
  if (!quantity)
    return res.status(400).json({
      error: row.targetLevel
        ? 'This location is already at or above its reorder point — nothing to replenish.'
        : 'Set a target level on this stock line before replenishing it.',
    })

  const [updated] = await db
    .update(stock)
    .set({ quantity: sql`${stock.quantity} + ${quantity}` })
    .where(eq(stock.id, row.id))
    .returning()

  await db.insert(auditLog).values({
    userId: req.user!.id,
    action: 'stock_replenished',
    detail: {
      warehouse: row.warehouse,
      product: row.product,
      quantity,
      from: row.quantity,
      to: updated.quantity,
      targetLevel: row.targetLevel,
    },
  })

  res.json({
    ok: true,
    warehouse: row.warehouse,
    product: row.product,
    received: quantity,
    onHand: updated.quantity,
  })
}

/* ---- consolidate: try to fulfill backordered rows from stock that has since arrived ---- */
export async function consolidateBackorder(req: Request<{ id: string }>, res: Response) {
  const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!quote) return res.status(404).json({ error: 'not found' })
  if (!FULFILLABLE.includes(quote.status))
    return res.status(400).json({ error: notFulfillable(quote.status) })

  const backorders = await db
    .select({
      id: fulfillmentAllocations.id,
      lineId: fulfillmentAllocations.quoteLineId,
      productId: quoteLines.productId,
      quantity: fulfillmentAllocations.quantity,
    })
    .from(fulfillmentAllocations)
    .innerJoin(quoteLines, eq(fulfillmentAllocations.quoteLineId, quoteLines.id))
    .where(
      and(
        eq(fulfillmentAllocations.quotationId, req.params.id),
        eq(fulfillmentAllocations.backordered, true),
      ),
    )

  try {
    await db.transaction(async (tx) => {
      for (const b of backorders) {
        let remaining = b.quantity
        const stocks = await tx
          .select({ warehouseId: stock.warehouseId, quantity: stock.quantity, weight: warehouses.shippingCostWeight })
          .from(stock)
          .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
          .where(eq(stock.productId, b.productId))
        const split = splitLine(
          remaining,
          stocks.map((s) => ({ warehouseId: s.warehouseId, quantity: s.quantity, weight: Number(s.weight) })),
        )
        for (const a of split.allocations) {
          await tx
            .update(stock)
            .set({ quantity: sql`${stock.quantity} - ${a.quantity}` })
            .where(and(eq(stock.warehouseId, a.warehouseId), eq(stock.productId, b.productId)))
          await tx.insert(fulfillmentAllocations).values({
            quotationId: req.params.id,
            quoteLineId: b.lineId,
            warehouseId: a.warehouseId,
            quantity: a.quantity,
          })
          remaining -= a.quantity
        }
        if (remaining <= 0) await tx.delete(fulfillmentAllocations).where(eq(fulfillmentAllocations.id, b.id))
        else await tx.update(fulfillmentAllocations).set({ quantity: remaining }).where(eq(fulfillmentAllocations.id, b.id))
      }
    })
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message })
  }
  res.json(await currentAllocations(req.params.id))
}
