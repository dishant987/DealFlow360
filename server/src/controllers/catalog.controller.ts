import type { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { customers, products, categories } from '../models/schema.js'

// read-only catalog for the rep workspace (any authenticated internal user)
export async function listCustomers(_req: Request, res: Response) {
  res.json(await db.select().from(customers))
}

export async function listProducts(_req: Request, res: Response) {
  res.json(
    await db
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
      .innerJoin(categories, eq(products.categoryId, categories.id)),
  )
}
