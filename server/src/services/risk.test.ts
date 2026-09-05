import { describe, it, expect } from 'vitest'
import { computeBlendedRisk } from './risk.js'

const T = { managerThreshold: 5, financeThreshold: 12 }

describe('blended risk score', () => {
  it('flags the brief example: Gold laptop 12/15 fine, service 18/10 is 8 over → manager', () => {
    // effective ceilings: laptop min(15,15)=15, service min(15,10)=10
    const r = computeBlendedRisk(
      [
        { discountPct: 12, ceiling: 15 },
        { discountPct: 18, ceiling: 10 },
      ],
      T,
    )
    expect(r.score).toBe(8)
    expect(r.requiresManager).toBe(true)
    expect(r.requiresFinance).toBe(false)
    expect(r.level).toBe('manager')
    expect(r.breaches).toHaveLength(1)
    expect(r.breaches[0].overBy).toBe(8)
  })

  it('fully compliant quote needs no approval', () => {
    const r = computeBlendedRisk(
      [
        { discountPct: 10, ceiling: 15 },
        { discountPct: 8, ceiling: 10 },
      ],
      T,
    )
    expect(r.score).toBe(0)
    expect(r.level).toBe('none')
    expect(r.requiresManager).toBe(false)
  })

  it('blends many small overages that no single line reveals (2+3+2 = 7 → manager)', () => {
    const r = computeBlendedRisk(
      [
        { discountPct: 17, ceiling: 15 }, // 2
        { discountPct: 18, ceiling: 15 }, // 3
        { discountPct: 12, ceiling: 10 }, // 2
      ],
      T,
    )
    expect(r.score).toBe(7)
    expect(r.level).toBe('manager')
  })

  it('escalates to finance past the finance threshold (8 + 6 = 14 > 12)', () => {
    const r = computeBlendedRisk(
      [
        { discountPct: 18, ceiling: 10 }, // 8
        { discountPct: 21, ceiling: 15 }, // 6
      ],
      T,
    )
    expect(r.score).toBe(14)
    expect(r.requiresFinance).toBe(true)
    expect(r.requiresManager).toBe(true)
    expect(r.level).toBe('finance')
  })
})
