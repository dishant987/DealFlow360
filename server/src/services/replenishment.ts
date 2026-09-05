// Replenishment rules (brief A4) — pure, no DB.
//
// A rule lives on a warehouse+product row: restock when available falls to or
// below `reorderLevel`, and bring it back up to `targetLevel`. Availability is
// what is actually on hand minus anything already committed to a fulfilled deal,
// so stock reserved for an order does not look like stock you can sell again.

export interface StockRule {
  stockId: string
  warehouse: string
  product: string
  onHand: number
  /** already allocated to a deal that has not shipped out */
  reserved: number
  reorderLevel: number
  targetLevel: number
}

export interface Proposal {
  stockId: string
  warehouse: string
  product: string
  available: number
  reorderLevel: number
  targetLevel: number
  /** how many units to bring in */
  suggested: number
  /** below the reorder point with nothing left to sell */
  urgent: boolean
}

/**
 * Which locations need restocking, and by how much.
 *
 * A row with no target is skipped: the reorder level alone still drives the
 * low-stock warning, but there is nothing to propose without knowing the
 * quantity to restore.
 */
export function replenishmentPlan(rules: StockRule[]): Proposal[] {
  return rules
    .map((r) => {
      const available = r.onHand - r.reserved
      return { rule: r, available }
    })
    .filter(({ rule, available }) => rule.targetLevel > 0 && available <= rule.reorderLevel)
    .map(({ rule, available }) => ({
      stockId: rule.stockId,
      warehouse: rule.warehouse,
      product: rule.product,
      available,
      reorderLevel: rule.reorderLevel,
      targetLevel: rule.targetLevel,
      // never propose a negative top-up if a location is somehow over target
      suggested: Math.max(0, rule.targetLevel - available),
      urgent: available <= 0,
    }))
    .filter((p) => p.suggested > 0)
    // the emptiest shelves first
    .sort((a, b) => a.available - b.available || b.suggested - a.suggested)
}
