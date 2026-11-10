// Pure pricing math — no DB. Shared by the quote endpoints and unit-tested.
// Money may arrive as string (Drizzle NUMERIC) or number; we coerce.

export interface LineInput {
  quantity: number
  unitPrice: number | string
  unitCost: number | string
  discountPct: number | string
}

const n = (v: number | string) => Number(v) || 0
const round2 = (x: number) => Math.round(x * 100) / 100

export interface LineTotals {
  gross: number // qty * price, before discount
  net: number // after line discount
  cost: number // qty * unitCost
  marginAmount: number // net - cost
  marginPct: number // marginAmount / net * 100
}

export function computeLine(line: LineInput): LineTotals {
  const qty = line.quantity
  const gross = n(line.unitPrice) * qty
  const net = gross * (1 - n(line.discountPct) / 100)
  const cost = n(line.unitCost) * qty
  const marginAmount = net - cost
  return {
    gross: round2(gross),
    net: round2(net),
    cost: round2(cost),
    marginAmount: round2(marginAmount),
    // nothing charged but something given away is a full loss, not 0%
    marginPct: net > 0 ? round2((marginAmount / net) * 100) : cost > 0 ? -100 : 0,
  }
}

export interface QuoteTotals {
  subtotal: number // sum of line nets (after line discounts)
  orderDiscountPct: number
  total: number // after order-level discount
  cost: number
  marginAmount: number
  marginPct: number
}

export function computeQuoteTotals(
  lines: LineInput[],
  orderDiscountPct: number | string = 0,
): QuoteTotals {
  let subtotal = 0
  let cost = 0
  for (const l of lines) {
    const t = computeLine(l)
    subtotal += t.net
    cost += t.cost
  }
  const orderDisc = n(orderDiscountPct)
  const total = subtotal * (1 - orderDisc / 100)
  const marginAmount = total - cost
  return {
    subtotal: round2(subtotal),
    orderDiscountPct: orderDisc,
    total: round2(total),
    cost: round2(cost),
    marginAmount: round2(marginAmount),
    marginPct: total > 0 ? round2((marginAmount / total) * 100) : cost > 0 ? -100 : 0,
  }
}

/** An amount after the quote's order-level discount — what billing charges for a line or a total. */
export function afterOrderDiscount(amount: number, orderDiscountPct: number | string = 0): number {
  return round2(amount * (1 - n(orderDiscountPct) / 100))
}

/**
 * The order discount once the customer signs with open counter-offers: the best of what they
 * already have and what they asked for — a counter never lowers a discount already given.
 */
export function acceptedDiscount(currentPct: number | string, counterPcts: (number | string)[]) {
  const current = n(currentPct)
  const pct = Math.max(current, ...counterPcts.map(n))
  return { pct, changed: pct !== current }
}
