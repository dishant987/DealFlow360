/*
 * Workspace overview numbers. Pure: the controller loads role-scoped quotes and
 * invoices, this turns them into KPIs and chart series, so every rule is tested.
 */
export type OverviewQuote = {
  status: string
  total: number // after all discounts
  gross: number // list value: unit price × quantity, before any discount
  updatedAt: Date
}
export type OverviewInvoice = { amount: number; issuedAt: Date }

const OPEN = ['draft', 'pending_approval', 'approved', 'sent', 'under_negotiation']
const WON = ['confirmed', 'fulfilled', 'invoiced']
const LOST = ['rejected', 'cancelled']
const STAGES = ['draft', 'pending_approval', 'approved', 'sent', 'under_negotiation', 'confirmed'] as const

const round2 = (n: number) => Math.round(n * 100) / 100
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function buildOverview(quotes: OverviewQuote[], invoices: OverviewInvoice[], now = new Date()) {
  const thisMonth = monthKey(now)
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = monthKey(last)
  const since90 = now.getTime() - 90 * 86_400_000

  const sum = (qs: OverviewQuote[]) => round2(qs.reduce((s, q) => s + q.total, 0))
  const open = quotes.filter((q) => OPEN.includes(q.status))
  // shortcut: a deal's win month is its last update; record a won_at date if reports ever need exactness
  const wonIn = (key: string) => quotes.filter((q) => WON.includes(q.status) && monthKey(q.updatedAt) === key)
  const recent = quotes.filter((q) => q.updatedAt.getTime() >= since90)
  const won90 = recent.filter((q) => WON.includes(q.status)).length
  const lost90 = recent.filter((q) => LOST.includes(q.status)).length
  const priced = recent.filter((q) => q.gross > 0)
  const gross = priced.reduce((s, q) => s + q.gross, 0)
  const net = priced.reduce((s, q) => s + q.total, 0)

  // last six months of invoiced revenue, oldest first, empty months included
  const months = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)))
  const revenue = months.map((m) => ({
    month: m,
    amount: round2(invoices.filter((inv) => monthKey(inv.issuedAt) === m).reduce((s, inv) => s + inv.amount, 0)),
  }))

  return {
    kpis: {
      openPipeline: sum(open),
      openCount: open.length,
      wonThisMonth: sum(wonIn(thisMonth)),
      wonLastMonth: sum(wonIn(lastMonth)),
      // null when nothing was decided in 90 days, so the UI says "—" instead of 0%
      winRate90d: won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
      avgDiscountPct: gross > 0 ? round2((1 - net / gross) * 100) : null,
    },
    pipeline: STAGES.map((s) => {
      const qs = quotes.filter((q) => q.status === s)
      return { stage: s, count: qs.length, value: sum(qs) }
    }),
    revenue,
  }
}
