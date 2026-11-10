import crypto from 'crypto'

// Quote versions and e-signature (step 26). Pure: callers build the snapshot from the DB.

export type SnapshotLine = {
  id: string
  product: string
  variantAttribute: string | null
  variantValue: string | null
  quantity: number
  unitPrice: string
  discountPct: string
  lineType: string
}
/** What the customer is shown and agrees to — never cost or margin. */
export type Snapshot = {
  quoteNumber: string
  customer: string | null
  currency: string
  validUntil: string | null
  contactName: string | null
  customerPo: string | null
  paymentTermsDays: number
  notesToCustomer: string | null
  terms: string | null
  orderDiscountPct: string
  lines: SnapshotLine[]
  subtotal: number
  total: number
}

/** JSON with keys sorted at every level, so equal content always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v ?? null)
}

// lines sorted by id: the database returns them in no fixed order, the content is what counts
export const versionHash = (s: Snapshot) =>
  crypto
    .createHash('sha256')
    .update(canonical({ ...s, lines: [...s.lines].sort((a, b) => a.id.localeCompare(b.id)) }))
    .digest('hex')

const HEADER: [keyof Snapshot, string][] = [
  ['validUntil', 'Valid until'],
  ['contactName', 'Addressed to'],
  ['customerPo', 'Customer PO'],
  ['paymentTermsDays', 'Payment terms (days)'],
  ['orderDiscountPct', 'Order discount %'],
  ['notesToCustomer', 'Notes to customer'],
  ['terms', 'Terms'],
  ['total', 'Total'],
]
const LINE: (keyof SnapshotLine)[] = ['quantity', 'unitPrice', 'discountPct', 'variantValue']
const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)
const same = (a: unknown, b: unknown) => num(a) === num(b) || (a == null && b == null)

/** What changed from version `a` to version `b`: header fields, and lines added, removed or changed. */
export function compareVersions(a: Snapshot, b: Snapshot) {
  const fields = HEADER.filter(([k]) => !same(a[k], b[k])).map(([k, label]) => ({ field: k, label, from: a[k], to: b[k] }))
  const before = new Map(a.lines.map((l) => [l.id, l]))
  const after = new Map(b.lines.map((l) => [l.id, l]))
  const added = b.lines.filter((l) => !before.has(l.id))
  const removed = a.lines.filter((l) => !after.has(l.id))
  const changed = b.lines
    .filter((l) => before.has(l.id))
    .map((l) => {
      const old = before.get(l.id)!
      const diffs = LINE.filter((k) => !same(old[k], l[k])).map((k) => ({ field: k, from: old[k], to: l[k] }))
      return { id: l.id, product: l.product, changes: diffs }
    })
    .filter((c) => c.changes.length > 0)
  return { fields, added, removed, changed, same: !fields.length && !added.length && !removed.length && !changed.length }
}
