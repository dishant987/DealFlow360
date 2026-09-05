import { describe, it, expect } from 'vitest'
import { computeLine, computeQuoteTotals } from './pricing.js'

describe('pricing', () => {
  it('computes a single line net, cost and margin', () => {
    // Laptop $1000 x1 @ 12% discount, cost $700
    const t = computeLine({ quantity: 1, unitPrice: '1000', unitCost: '700', discountPct: '12' })
    expect(t.net).toBe(880)
    expect(t.cost).toBe(700)
    expect(t.marginAmount).toBe(180)
    expect(t.marginPct).toBeCloseTo(20.45, 1)
  })

  it('handles quantity > 1', () => {
    const t = computeLine({ quantity: 3, unitPrice: 40, unitCost: 20, discountPct: 0 })
    expect(t.gross).toBe(120)
    expect(t.net).toBe(120)
    expect(t.cost).toBe(60)
    expect(t.marginAmount).toBe(60)
  })

  it('rolls up quote totals with an order-level discount', () => {
    const lines = [
      { quantity: 1, unitPrice: '1000', unitCost: '700', discountPct: '12' }, // net 880
      { quantity: 1, unitPrice: '200', unitCost: '150', discountPct: '18' }, // net 164
    ]
    const q = computeQuoteTotals(lines, 0)
    expect(q.subtotal).toBe(1044)
    expect(q.cost).toBe(850)
    expect(q.total).toBe(1044)
    expect(q.marginAmount).toBe(194)

    const q2 = computeQuoteTotals(lines, 10) // 10% off the order
    expect(q2.total).toBe(939.6)
    expect(q2.marginAmount).toBe(89.6)
  })

  it('guards divide-by-zero on an empty/free quote', () => {
    expect(computeQuoteTotals([]).marginPct).toBe(0)
    expect(computeLine({ quantity: 1, unitPrice: 0, unitCost: 0, discountPct: 0 }).marginPct).toBe(0)
  })
})
