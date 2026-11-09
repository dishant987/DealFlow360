import { describe, expect, it } from 'vitest'
import { currencySchema, money } from './format.js'

describe('money', () => {
  it('formats in the company currency with grouping', () => {
    expect(money(1000)).toBe('$1,000.00')
    expect(money('1234.5', 'EUR')).toBe('€1,234.50')
    expect(money(100000, 'INR')).toBe('₹1,00,000.00')
    expect(money(-5)).toBe('-$5.00')
    expect(money(null)).toBe('$0.00')
  })
})

describe('currencySchema', () => {
  it('accepts real ISO codes in any case, rejects others', () => {
    expect(currencySchema.parse('inr')).toBe('INR')
    expect(currencySchema.safeParse('XYZ1').success).toBe(false)
    expect(currencySchema.safeParse('DOLLARS').success).toBe(false)
  })
})
