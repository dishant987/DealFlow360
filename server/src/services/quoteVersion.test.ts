import { describe, expect, it } from 'vitest'
import { canonical, compareVersions, versionHash, type Snapshot } from './quoteVersion.js'

const line = (id: string, over: Partial<Snapshot['lines'][number]> = {}) => ({
  id,
  product: `P-${id}`,
  variantAttribute: null,
  variantValue: null,
  quantity: 1,
  unitPrice: '100.00',
  discountPct: '0.00',
  lineType: 'onetime',
  ...over,
})
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  quoteNumber: 'QT-2026-0001',
  customer: 'Acme',
  currency: 'USD',
  validUntil: null,
  contactName: null,
  customerPo: null,
  paymentTermsDays: 30,
  notesToCustomer: null,
  terms: null,
  orderDiscountPct: '0.00',
  lines: [line('a'), line('b')],
  subtotal: 200,
  total: 200,
  ...over,
})

describe('quote versions', () => {
  it('hashes equal content the same regardless of key order, and different content differently', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: null }] })).toBe('{"a":[{"c":null,"d":2}],"b":1}')
    const s = snap()
    const reordered = Object.fromEntries(Object.entries(s).reverse()) as Snapshot
    expect(versionHash(reordered)).toBe(versionHash(s))
    expect(versionHash(snap({ lines: [line('b'), line('a')] }))).toBe(versionHash(s)) // line order doesn't matter
    expect(versionHash(snap({ total: 199 }))).not.toBe(versionHash(s))
  })

  it('reports nothing when only number formatting differs', () => {
    expect(compareVersions(snap(), snap({ orderDiscountPct: '0', lines: [line('a', { unitPrice: '100' }), line('b')] })).same).toBe(true)
  })

  it('finds header changes and lines added, removed and changed', () => {
    const before = snap()
    const after = snap({
      orderDiscountPct: '5.00',
      total: 380,
      lines: [line('a', { quantity: 3, discountPct: '10.00' }), line('c', { product: 'New thing' })],
    })
    const d = compareVersions(before, after)
    expect(d.same).toBe(false)
    expect(d.fields.map((f) => f.field)).toEqual(['orderDiscountPct', 'total'])
    expect(d.added.map((l) => l.id)).toEqual(['c'])
    expect(d.removed.map((l) => l.id)).toEqual(['b'])
    expect(d.changed).toEqual([
      { id: 'a', product: 'P-a', changes: [{ field: 'quantity', from: 1, to: 3 }, { field: 'discountPct', from: '0.00', to: '10.00' }] },
    ])
  })
})
