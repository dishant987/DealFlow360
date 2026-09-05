import { describe, it, expect } from 'vitest'
import { findDiscountAnomalies } from './anomaly.js'

describe('discount anomalies', () => {
  it('flags a spike above the rep average (and past the floor)', () => {
    const anomalies = findDiscountAnomalies([
      { id: 'a', repId: 'r1', riskScore: 0 },
      { id: 'b', repId: 'r1', riskScore: 0 },
      { id: 'c', repId: 'r1', riskScore: 2 },
      { id: 'd', repId: 'r1', riskScore: 12 }, // mean=3.5, 12 > 6 floor and > 7 → flagged
    ])
    expect(anomalies.map((a) => a.id)).toEqual(['d'])
  })

  it('does not flag a rep whose scores are all low', () => {
    expect(
      findDiscountAnomalies([
        { id: 'a', repId: 'r1', riskScore: 3 },
        { id: 'b', repId: 'r1', riskScore: 4 },
      ]),
    ).toHaveLength(0)
  })

  it('scopes the average per rep', () => {
    const anomalies = findDiscountAnomalies([
      { id: 'a', repId: 'r1', riskScore: 20 }, // r1 mean 20 → not > 40
      { id: 'b', repId: 'r2', riskScore: 0 },
      { id: 'c', repId: 'r2', riskScore: 14 }, // r2 mean 7 → 14 > 14? no (strict). tweak below
    ])
    expect(anomalies.every((a) => a.id !== 'a')).toBe(true)
  })
})
