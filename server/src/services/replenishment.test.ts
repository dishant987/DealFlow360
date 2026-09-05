import { describe, it, expect } from 'vitest'
import { replenishmentPlan, type StockRule } from './replenishment.js'

const rule = (over: Partial<StockRule> = {}): StockRule => ({
  stockId: 's1',
  warehouse: 'Main Warehouse',
  product: '4K Monitor',
  onHand: 10,
  reserved: 0,
  reorderLevel: 4,
  targetLevel: 20,
  ...over,
})

describe('replenishment rules', () => {
  it('proposes nothing while a location is above its reorder point', () => {
    expect(replenishmentPlan([rule({ onHand: 10 })])).toHaveLength(0)
  })

  it('tops a location back up to its target once it hits the reorder point', () => {
    const [p] = replenishmentPlan([rule({ onHand: 4 })]) // at the point, not past it
    expect(p.suggested).toBe(16) // 20 target − 4 available
    expect(p.urgent).toBe(false)
  })

  it('counts reserved stock as unavailable', () => {
    // 12 on the shelf but 9 committed to a fulfilled deal leaves 3
    const [p] = replenishmentPlan([rule({ onHand: 12, reserved: 9 })])
    expect(p.available).toBe(3)
    expect(p.suggested).toBe(17)
  })

  it('flags an empty location as urgent', () => {
    const [p] = replenishmentPlan([rule({ onHand: 3, reserved: 3 })])
    expect(p.available).toBe(0)
    expect(p.urgent).toBe(true)
  })

  it('skips rows with no target — a warning without a restock quantity', () => {
    expect(replenishmentPlan([rule({ onHand: 0, targetLevel: 0 })])).toHaveLength(0)
  })

  it('never proposes a negative top-up', () => {
    expect(replenishmentPlan([rule({ onHand: 30, reorderLevel: 40, targetLevel: 20 })])).toHaveLength(0)
  })

  it('puts the emptiest shelves first', () => {
    const plan = replenishmentPlan([
      rule({ stockId: 'a', onHand: 4 }),
      rule({ stockId: 'b', onHand: 0 }),
      rule({ stockId: 'c', onHand: 2 }),
    ])
    expect(plan.map((p) => p.stockId)).toEqual(['b', 'c', 'a'])
  })
})
