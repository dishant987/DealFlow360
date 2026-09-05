import { describe, it, expect } from 'vitest'
import { nextBillingDate, proratedAmount, refundAmount, intervalMonths } from './billing.js'

describe('billing math', () => {
  it('advances the billing date by the interval', () => {
    expect(intervalMonths('quarterly')).toBe(3)
    const next = nextBillingDate(new Date('2026-01-15'), 'monthly')
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-15')
  })

  it('prorates the remaining period', () => {
    expect(proratedAmount(100, 15, 30)).toBe(50)
    expect(proratedAmount(100, 30, 30)).toBe(100)
    expect(proratedAmount(100, 40, 30)).toBe(100) // clamps to full period
    expect(proratedAmount(100, 0, 30)).toBe(0)
  })

  it('refunds the prorated unused portion at the plan refund %', () => {
    // 15 of 30 days left → $50 unused → 50% refund → $25
    expect(refundAmount(100, 15, 30, 50)).toBe(25)
    expect(refundAmount(100, 30, 30, 100)).toBe(100)
  })
})
