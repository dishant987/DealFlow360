import { describe, it, expect } from 'vitest'
import { acceptedDiscount, afterOrderDiscount, computeLine, computeQuoteTotals } from './pricing.js'

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

  it('a fully discounted line with cost is a -100% margin, not 0%', () => {
    expect(computeLine({ quantity: 2, unitPrice: 950, unitCost: 700, discountPct: 100 })).toMatchObject({ net: 0, marginAmount: -1400, marginPct: -100 })
  })

  it('billing applies the order discount the same way the quote total does', () => {
    expect(afterOrderDiscount(950, 10)).toBe(855)
    expect(afterOrderDiscount(50, '10')).toBe(45)
    const lines = [
      { quantity: 1, unitPrice: 950, unitCost: 700, discountPct: 0 },
      { quantity: 1, unitPrice: 50, unitCost: 10, discountPct: 0 },
    ]
    expect(afterOrderDiscount(950, 10) + afterOrderDiscount(50, 10)).toBe(computeQuoteTotals(lines, 10).total)
  })

  it('a counter-offer only ever raises the order discount', () => {
    expect(acceptedDiscount('15', ['5'])).toEqual({ pct: 15, changed: false })
    expect(acceptedDiscount(10, [12, '20'])).toEqual({ pct: 20, changed: true })
    expect(acceptedDiscount(0, [])).toEqual({ pct: 0, changed: false })
  })
})
