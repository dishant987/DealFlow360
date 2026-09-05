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
    marginPct: net > 0 ? round2((marginAmount / net) * 100) : 0,
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
    marginPct: total > 0 ? round2((marginAmount / total) * 100) : 0,
  }
}
