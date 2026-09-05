// Mirror of server/src/services/pricing.ts — kept tiny for instant live margin.
// Server remains the source of truth on load/save; this only drives immediate UI feedback.
export interface LineLike {
  quantity: number
  unitPrice: number | string
  unitCost: number | string
  discountPct: number | string
}

const n = (v: number | string) => Number(v) || 0
const round2 = (x: number) => Math.round(x * 100) / 100

export function lineNet(l: LineLike) {
  return round2(n(l.unitPrice) * l.quantity * (1 - n(l.discountPct) / 100))
}
export function lineMargin(l: LineLike) {
  const net = lineNet(l)
  const cost = n(l.unitCost) * l.quantity
  const marginAmount = round2(net - cost)
  return { net, marginAmount, marginPct: net > 0 ? round2((marginAmount / net) * 100) : 0 }
}

export function quoteTotals(lines: LineLike[], orderDiscountPct: number | string = 0) {
  let subtotal = 0
  let cost = 0
  for (const l of lines) {
    subtotal += lineNet(l)
    cost += n(l.unitCost) * l.quantity
  }
  const total = subtotal * (1 - n(orderDiscountPct) / 100)
  const marginAmount = total - cost
  return {
    subtotal: round2(subtotal),
    total: round2(total),
    cost: round2(cost),
    marginAmount: round2(marginAmount),
    marginPct: total > 0 ? round2((marginAmount / total) * 100) : 0,
  }
}
