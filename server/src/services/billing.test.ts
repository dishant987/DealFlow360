import { describe, it, expect } from 'vitest'
import {
  nextBillingDate,
  periodDays,
  proratedAmount,
  refundAmount,
  intervalMonths,
  applyPayment,
} from './billing.js'

describe('billing math', () => {
  it('advances the billing date by the interval', () => {
    expect(intervalMonths('quarterly')).toBe(3)
    const next = nextBillingDate(new Date('2026-01-15'), 'monthly')
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-15')
  })

  it('never lets a short month swallow a billing period', () => {
    // compare LOCAL calendar dates — toISOString() would shift midnight across
    // the date line in any timezone east or west of UTC
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const on = (s: string) => ymd(nextBillingDate(new Date(s + 'T00:00:00'), 'monthly'))
    // Jan 31 + 1 month used to land on Mar 3, skipping February entirely
    expect(on('2026-01-31')).toBe('2026-02-28')
    expect(on('2024-01-31')).toBe('2024-02-29') // leap year
    expect(on('2026-03-31')).toBe('2026-04-30')
    // a day that exists in both months is untouched
    expect(on('2026-01-15')).toBe('2026-02-15')
  })

  it('prorates against the real length of the period, not a nominal 30 days', () => {
    const at = (s: string) => new Date(s + 'T00:00:00')
    expect(periodDays(at('2026-02-01'), 'monthly')).toBe(31) // January
    expect(periodDays(at('2026-03-01'), 'monthly')).toBe(28) // February
    expect(periodDays(at('2024-03-01'), 'monthly')).toBe(29) // leap February
    expect(periodDays(at('2026-04-01'), 'quarterly')).toBe(90)
    expect(periodDays(at('2026-01-01'), 'yearly')).toBe(365)
  })

  it('prorates the remaining period', () => {
    expect(proratedAmount(100, 15, 30)).toBe(50)
    expect(proratedAmount(100, 30, 30)).toBe(100)
    expect(proratedAmount(100, 40, 30)).toBe(100) // clamps to full period
    expect(proratedAmount(100, 0, 30)).toBe(0)
  })

  it('a partial payment leaves the invoice open; only clearing the balance settles it', () => {
    // $1 against a $5000 invoice must NOT mark it paid
    const partial = applyPayment(5000, 0, 1)
    expect(partial.settled).toBe(false)
    expect(partial.balance).toBe(4999)

    // the rest of it does
    const rest = applyPayment(5000, 1)
    expect(rest.amount).toBe(4999) // no amount given → pay the balance
    expect(rest.settled).toBe(true)
    expect(rest.balance).toBe(0)

    // overpaying still settles, and an already-settled invoice has nothing outstanding
    expect(applyPayment(100, 0, 150).settled).toBe(true)
    expect(applyPayment(100, 100).outstanding).toBe(0)
  })

  it('refunds the prorated unused portion at the plan refund %', () => {
    // 15 of 30 days left → $50 unused → 50% refund → $25
    expect(refundAmount(100, 15, 30, 50)).toBe(25)
    expect(refundAmount(100, 30, 30, 100)).toBe(100)
  })
})
