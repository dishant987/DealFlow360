import { Router } from 'express'
import { z, type ZodTypeAny } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'

// numeric/money fields: accept number or string from the client, store as string
export const num = z.union([z.number(), z.string()]).transform((v) => String(v))
export const tier = z.enum(['bronze', 'silver', 'gold'])

// ponytail: one generic CRUD router over trusted admin-only tables; Zod guards every write.
export function crud(table: any, insertSchema: ZodTypeAny) {
  const updateSchema = (insertSchema as z.ZodObject<z.ZodRawShape>).partial()
  const r = Router()
  r.get('/', async (_req, res) => res.json(await db.select().from(table)))
  r.post('/', async (req, res) => {
    const p = insertSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.issues })
    const [row] = (await db.insert(table).values(p.data as any).returning()) as any[]
    res.status(201).json(row)
  })
  r.patch('/:id', async (req, res) => {
    const p = updateSchema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.issues })
    const [row] = (await db
      .update(table)
      .set(p.data as any)
      .where(eq(table.id, req.params.id))
      .returning()) as any[]
    if (!row) return res.status(404).json({ error: 'not found' })
    res.json(row)
  })
  r.delete('/:id', async (req, res) => {
    const [row] = (await db.delete(table).where(eq(table.id, req.params.id)).returning()) as any[]
    if (!row) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  })
  return r
}
