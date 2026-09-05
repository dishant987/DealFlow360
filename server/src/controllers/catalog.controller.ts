import type { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { customers, products, categories, productVariants } from '../models/schema.js'

// read-only catalog for the rep workspace (any authenticated internal user)
export async function listCustomers(_req: Request, res: Response) {
  res.json(await db.select().from(customers))
}

export async function listProducts(_req: Request, res: Response) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: categories.name,
      categoryId: products.categoryId,
      type: products.type,
      unitPrice: products.unitPrice,
      unitCost: products.unitCost,
      isPromoted: products.isPromoted,
      active: products.active,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))

  // attach variants so the builder can offer "Size: Large (+$50)"
  const variants = await db.select().from(productVariants)
  res.json(
    rows.map((p) => ({
      ...p,
      variants: variants
        .filter((v) => v.productId === p.id)
        .map((v) => ({ id: v.id, attribute: v.attribute, value: v.value, extraPrice: v.extraPrice })),
    })),
  )
}
