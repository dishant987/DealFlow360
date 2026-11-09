import type { Request, Response } from 'express'
import { Readable } from 'stream'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { auditLog, categories, customers, products, subscriptionPlans } from '../models/schema.js'
import {
  MAX_ROWS,
  normaliseHeader,
  planImport,
  templateCsv,
  type ImportKind,
  type Lookups,
  type RawRow,
} from '../services/import.js'

const kindSchema = z.enum(['customers', 'products'])
const bodySchema = z.object({
  filename: z.string().min(1),
  // the browser sends the file base64-encoded, so no multipart dependency is needed
  data: z.string().min(1),
  mode: z.enum(['update', 'skip']).default('update'),
  commit: z.boolean().default(false),
})

/** First worksheet (or the CSV) as header-keyed rows of display text. */
export async function readRows(buf: Buffer, filename: string): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook()
  const ws = /\.csv$/i.test(filename)
    ? await wb.csv.read(Readable.from(buf))
    : (await wb.xlsx.load(buf as unknown as ArrayBuffer), wb.worksheets[0])
  if (!ws) return []
  const headers: string[] = []
  // cell.text flattens Excel's rich text, formulas and auto-hyperlinked emails to what the user sees
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = normaliseHeader(c.text ?? '')))
  const rows: RawRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const rec: RawRow = {}
    headers.forEach((h, col) => h && (rec[h] = (row.getCell(col).text ?? '').trim()))
    rows.push(rec)
  }
  return rows
}

async function lookups(): Promise<Lookups> {
  const lower = <T extends { k: string | null; id: string }>(rows: T[]) =>
    new Map(rows.filter((r) => r.k).map((r) => [r.k!.toLowerCase(), r.id]))
  const [c, p, cat, plan] = await Promise.all([
    db.select({ k: customers.email, id: customers.id }).from(customers),
    db.select({ k: products.sku, id: products.id }).from(products),
    db.select({ k: categories.name, id: categories.id }).from(categories),
    db.select({ k: subscriptionPlans.name, id: subscriptionPlans.id }).from(subscriptionPlans),
  ])
  return { customersByEmail: lower(c), productsBySku: lower(p), categoriesByName: lower(cat), plansByName: lower(plan) }
}

export function importTemplate(req: Request<{ kind: string }>, res: Response) {
  const k = kindSchema.safeParse(req.params.kind)
  if (!k.success) return res.status(404).json({ error: 'not found' })
  res
    .type('text/csv')
    .attachment(`dealwise-${k.data}-template.csv`)
    .send(templateCsv(k.data))
}

/** Preview (commit=false) or import (commit=true). An import with any bad row writes nothing. */
export async function importRows(req: Request<{ kind: string }>, res: Response) {
  const k = kindSchema.safeParse(req.params.kind)
  if (!k.success) return res.status(404).json({ error: 'not found' })
  const kind: ImportKind = k.data
  const p = bodySchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Send a CSV or Excel file.' })
  if (!/\.(csv|xlsx)$/i.test(p.data.filename))
    return res.status(400).json({ error: 'Use a .csv or .xlsx file.' })

  let rows: RawRow[]
  try {
    rows = await readRows(Buffer.from(p.data.data, 'base64'), p.data.filename)
  } catch {
    return res.status(400).json({ error: "That file couldn't be read. Save it as .csv or .xlsx and try again." })
  }
  if (rows.length > MAX_ROWS)
    return res.status(400).json({ error: `Too many rows (${rows.length}). Import at most ${MAX_ROWS} at a time.` })

  const plan = planImport(kind, rows, await lookups(), p.data.mode)
  if (!plan.rows.length) return res.status(400).json({ error: 'No rows found under the header row.' })
  if (!p.data.commit) return res.json(plan)
  if (plan.summary.error)
    return res.status(400).json({ error: `Fix the ${plan.summary.error} row(s) with errors first.`, ...plan })

  await db.transaction(async (tx) => {
    for (const r of plan.rows) {
      if (r.action === 'create') {
        // planImport validated every value and filled the required ones
        if (kind === 'customers') await tx.insert(customers).values(r.values as unknown as typeof customers.$inferInsert)
        else await tx.insert(products).values(r.values as unknown as typeof products.$inferInsert)
      } else if (r.action === 'update') {
        if (kind === 'customers') await tx.update(customers).set(r.values!).where(eq(customers.id, r.id!))
        else await tx.update(products).set(r.values!).where(eq(products.id, r.id!))
      }
    }
    await tx.insert(auditLog).values({
      userId: req.user!.id,
      action: 'bulk_import',
      detail: { kind, file: p.data.filename, ...plan.summary },
    })
  })
  res.json(plan)
}
