// Warehouse split heuristic (brief B6) — pure, no DB.
// Goal: fulfill each line while minimizing shipments, using shipping-cost
// weight to break ties. Remainder beyond available stock is backordered.
// ponytail: greedy per line (single-warehouse if possible, else cheapest-first).
// Optimal cross-product shipment minimization is bin-packing — not worth it here.

export interface WhStock {
  warehouseId: string
  quantity: number
  weight: number // shipping cost weight (lower = preferred)
}
export interface Allocation {
  warehouseId: string
  quantity: number
}
export interface LineSplit {
  allocations: Allocation[]
  backordered: number
}

export function splitLine(needed: number, stocks: WhStock[]): LineSplit {
  const sorted = [...stocks].sort((a, b) => a.weight - b.weight || b.quantity - a.quantity)

  // prefer the cheapest single warehouse that can fully fulfill → 1 shipment
  const single = sorted.find((s) => s.quantity >= needed)
  if (single) return { allocations: [{ warehouseId: single.warehouseId, quantity: needed }], backordered: 0 }

  // otherwise fill greedily, cheapest first
  let remaining = needed
  const allocations: Allocation[] = []
  for (const s of sorted) {
    if (remaining <= 0) break
    const take = Math.min(remaining, s.quantity)
    if (take > 0) {
      allocations.push({ warehouseId: s.warehouseId, quantity: take })
      remaining -= take
    }
  }
  return { allocations, backordered: Math.max(0, remaining) }
}

// distinct warehouses used across the order = shipment count
export function shipmentCount(allocations: Allocation[]): number {
  return new Set(allocations.filter((a) => a.quantity > 0).map((a) => a.warehouseId)).size
}
