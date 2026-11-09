import { z } from 'zod'

/*
 * Bulk import planner. Pure: it gets the parsed rows plus lookups of what already
 * exists, and decides per row whether to create, update, skip or reject it. The
 * controller only reads the lookups and writes the plan, so every rule is tested here.
 */

export type ImportKind = 'customers' | 'products'
export type Mode = 'update' | 'skip'
export type RawRow = Record<string, string>

export type Lookups = {
  customersByEmail: Map<string, string> // email (lower) -> id
  productsBySku: Map<string, string> // sku (lower) -> id
  categoriesByName: Map<string, string> // name (lower) -> id
  plansByName: Map<string, string> // name (lower) -> id
}

export type PlannedRow = {
  row: number // spreadsheet row number (header is row 1)
  action: 'create' | 'update' | 'skip' | 'error'
  key: string
  errors: string[]
  id?: string
  values?: Record<string, string>
}

export const MAX_ROWS = 2000

export const COLUMNS: Record<ImportKind, { required: string[]; optional: string[]; example: string[] }> = {
  customers: {
    required: ['name', 'email'],
    optional: ['tier'],
    example: ['Acme Corp', 'buyer@acme.com', 'silver'],
  },
  products: {
    required: ['name', 'sku', 'category', 'unit_price', 'unit_cost'],
    optional: ['type', 'unit', 'tax_rate', 'description', 'subscription_plan'],
    example: ['Business Laptop', 'HW-LAPTOP', 'Hardware', '1000', '700', 'onetime', 'unit', '18', '14-inch laptop', ''],
  },
}

/** "Unit Price " -> "unit_price", so headers forgive case and spacing. */
export const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a number like 1200 or 99.50')
const email = z.string().trim().toLowerCase().email('is not a valid email')
const tierSchema = z.enum(['bronze', 'silver', 'gold'], { message: 'must be bronze, silver or gold' })

function checkCustomer(r: RawRow, errors: string[]) {
  const values: Record<string, string> = {}
  if (!r.name?.trim()) errors.push('name is required')
  else values.name = r.name.trim()
  const e = email.safeParse(r.email ?? '')
  if (!r.email?.trim()) errors.push('email is required')
  else if (!e.success) errors.push(`email ${e.error.issues[0].message}`)
  else values.email = e.data
  if (r.tier?.trim()) {
    const t = tierSchema.safeParse(r.tier.trim().toLowerCase())
    if (!t.success) errors.push(`tier ${t.error.issues[0].message}`)
    else values.tier = t.data
  }
  return { key: values.email ?? '', values }
}

function checkProduct(r: RawRow, errors: string[], lk: Lookups) {
  const values: Record<string, string> = {}
  for (const f of ['name', 'sku'] as const) {
    if (!r[f]?.trim()) errors.push(`${f} is required`)
    else values[f] = r[f].trim()
  }
  const cat = r.category?.trim()
  if (!cat) errors.push('category is required')
  else if (!lk.categoriesByName.has(cat.toLowerCase())) errors.push(`category "${cat}" doesn't exist`)
  else values.categoryId = lk.categoriesByName.get(cat.toLowerCase())!
  for (const [col, field] of [
    ['unit_price', 'unitPrice'],
    ['unit_cost', 'unitCost'],
  ] as const) {
    const v = money.safeParse(r[col] ?? '')
    if (!r[col]?.trim()) errors.push(`${col} is required`)
    else if (!v.success) errors.push(`${col} ${v.error.issues[0].message}`)
    else values[field] = v.data
  }
  // blank type keeps an existing product's type; new products default to onetime (in planImport)
  const type = (r.type ?? '').trim().toLowerCase().replace(/[\s-]/g, '')
  if (type && type !== 'onetime' && type !== 'subscription') errors.push('type must be onetime or subscription')
  else if (type) values.type = type
  if (r.tax_rate?.trim()) {
    const n = Number(r.tax_rate)
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push('tax_rate must be between 0 and 100')
    else values.taxRate = String(n)
  }
  if (r.unit?.trim()) values.unit = r.unit.trim()
  if (r.description?.trim()) values.description = r.description.trim()
  const plan = r.subscription_plan?.trim()
  if (type === 'subscription') {
    if (!plan) errors.push('subscription_plan is required for a subscription product')
    else if (!lk.plansByName.has(plan.toLowerCase())) errors.push(`subscription_plan "${plan}" doesn't exist`)
    else values.subscriptionPlanId = lk.plansByName.get(plan.toLowerCase())!
  }
  return { key: values.sku?.toLowerCase() ?? '', values }
}

export function planImport(kind: ImportKind, rows: RawRow[], lk: Lookups, mode: Mode) {
  const seen = new Map<string, number>()
  const planned: PlannedRow[] = []
  rows.forEach((r, i) => {
    const row = i + 2
    // a fully blank line is not a row anyone meant to import
    if (Object.values(r).every((v) => !v?.trim())) return
    const errors: string[] = []
    const { key, values } = kind === 'customers' ? checkCustomer(r, errors) : checkProduct(r, errors, lk)

    if (key && seen.has(key))
      errors.push(`duplicate of row ${seen.get(key)} (${kind === 'customers' ? 'email' : 'SKU'} must be unique in the file)`)
    if (key && !seen.has(key)) seen.set(key, row)
    if (errors.length) return planned.push({ row, action: 'error', key, errors })

    const id = (kind === 'customers' ? lk.customersByEmail : lk.productsBySku).get(key)
    if (!id) {
      if (kind === 'customers') values.tier ??= 'bronze'
      else values.type ??= 'onetime'
      return planned.push({ row, action: 'create', key, errors, values })
    }
    planned.push({ row, action: mode === 'update' ? 'update' : 'skip', key, errors, id, values })
  })
  const count = (a: PlannedRow['action']) => planned.filter((p) => p.action === a).length
  return {
    rows: planned,
    summary: { create: count('create'), update: count('update'), skip: count('skip'), error: count('error') },
  }
}

/** A template: the header row plus one example line. */
export function templateCsv(kind: ImportKind) {
  const c = COLUMNS[kind]
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return `${[...c.required, ...c.optional].join(',')}\n${c.example.map(esc).join(',')}\n`
}
