import { Router, type Response } from 'express'
import { z, type ZodTypeAny } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { friendlyDbError } from './dbError.js'

// numeric/money fields: accept number or string from the client, store as string
export const num = z.union([z.number(), z.string()]).transform((v) => String(v))
export const tier = z.enum(['bronze', 'silver', 'gold'])

// A constraint violation here is normal use, not an exception: adding a second
// ceiling for a category, reusing a SKU. Report it as such rather than letting
// the driver error reach the browser.
function handleDbError(e: unknown, res: Response) {
  const friendly = friendlyDbError(e)
  if (friendly) return res.status(friendly.status).json({ error: friendly.error })
  throw e
}

// ponytail: one generic CRUD router over trusted admin-only tables; Zod guards every write.
export function crud(table: any, insertSchema: ZodTypeAny) {
  const updateSchema = (insertSchema as z.ZodObject<z.ZodRawShape>).partial()
  const r = Router()
  r.get('/', async (_req, res) => res.json(await db.select().from(table)))
  r.post('/', async (req, res) => {
    const p = insertSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.issues })
    try {
      const [row] = (await db.insert(table).values(p.data as any).returning()) as any[]
      res.status(201).json(row)
    } catch (e) {
      handleDbError(e, res)
    }
  })
  r.patch('/:id', async (req, res) => {
    const p = updateSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.issues })
    try {
      const [row] = (await db
        .update(table)
        .set(p.data as any)
        .where(eq(table.id, req.params.id))
        .returning()) as any[]
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) {
      handleDbError(e, res)
    }
  })
  r.delete('/:id', async (req, res) => {
    try {
      const [row] = (await db.delete(table).where(eq(table.id, req.params.id)).returning()) as any[]
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true })
    } catch (e) {
      // deleting something a quotation still points at trips a foreign key
      handleDbError(e, res)
    }
  })
  return r
}
