import { describe, it, expect } from 'vitest'
import { splitLine, shipmentCount } from './fulfillment.js'

const main = { warehouseId: 'main', quantity: 8, weight: 1 }
const east = { warehouseId: 'east', quantity: 5, weight: 1.5 }

describe('warehouse split', () => {
  it('splits across two warehouses when no single one suffices (10 = 8 + 2)', () => {
    const r = splitLine(10, [main, east])
    expect(r.allocations).toEqual([
      { warehouseId: 'main', quantity: 8 },
      { warehouseId: 'east', quantity: 2 },
    ])
    expect(r.backordered).toBe(0)
  })

  it('uses a single cheapest warehouse when it can fully fulfill (min shipments)', () => {
    const r = splitLine(6, [main, east])
    expect(r.allocations).toEqual([{ warehouseId: 'main', quantity: 6 }])
    expect(shipmentCount(r.allocations)).toBe(1)
  })

  it('backorders the remainder when stock is short (20 → 13 + 7 backorder)', () => {
    const r = splitLine(20, [main, east])
    expect(r.allocations).toEqual([
      { warehouseId: 'main', quantity: 8 },
      { warehouseId: 'east', quantity: 5 },
    ])
    expect(r.backordered).toBe(7)
  })

  it('prefers the lower-weight warehouse first', () => {
    const pricey = { warehouseId: 'pricey', quantity: 100, weight: 5 }
    const r = splitLine(3, [pricey, east])
    expect(r.allocations[0].warehouseId).toBe('east') // weight 1.5 < 5
  })
})
