import { describe, expect, it } from 'vitest'
import { num, pct } from './crud.js'

describe('pct', () => {
  it('accepts 0–100 as number or string; blank is 0', () => {
    expect(pct.parse(15)).toBe('15')
    expect(pct.parse('12.5')).toBe('12.5')
    expect(pct.parse('')).toBe('0')
    expect(pct.parse(100)).toBe('100')
  })
  it('refuses negatives, over 100 and junk', () => {
    for (const bad of [-20, 150, '999', 'abc']) expect(pct.safeParse(bad).success).toBe(false)
  })
})

describe('num', () => {
  it('keeps zero or more, rejects negatives, blanks and text', () => {
    expect(num.parse('12.50')).toBe('12.50')
    expect(num.parse(0)).toBe('0')
    for (const bad of [-5, '', 'abc']) expect(num.safeParse(bad).success).toBe(false)
  })
})
