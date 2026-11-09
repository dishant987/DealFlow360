import { describe, expect, it } from 'vitest'
import { buildOverview, type OverviewQuote } from './overview.js'

const now = new Date(2026, 10, 15) // 15 Nov 2026
const q = (status: string, total: number, gross: number, updatedAt: Date): OverviewQuote => ({ status, total, gross, updatedAt })

describe('buildOverview', () => {
  const quotes = [
    q('draft', 1000, 1000, new Date(2026, 10, 10)),
    q('sent', 500, 600, new Date(2026, 10, 12)),
    q('confirmed', 900, 1000, new Date(2026, 10, 2)), // won this month
    q('invoiced', 400, 400, new Date(2026, 9, 20)), // won last month
    q('rejected', 300, 300, new Date(2026, 9, 1)), // lost
    q('confirmed', 100, 100, new Date(2025, 0, 1)), // too old for the 90-day figures
  ]
  const invoices = [
    { amount: 400, issuedAt: new Date(2026, 9, 21) },
    { amount: 250, issuedAt: new Date(2026, 10, 3) },
    { amount: 999, issuedAt: new Date(2026, 1, 1) }, // older than six months
  ]
  const o = buildOverview(quotes, invoices, now)

  it('sums the open pipeline and the deals won this month vs last month', () => {
    expect(o.kpis).toMatchObject({ openPipeline: 1500, openCount: 2, wonThisMonth: 900, wonLastMonth: 400 })
  })

  it('win rate and average discount use the last 90 days only', () => {
    // won: confirmed + invoiced = 2, lost: rejected = 1 -> 67%
    expect(o.kpis.winRate90d).toBe(67)
    // recent net 3100 of gross 3300 -> 6.06% off list
    expect(o.kpis.avgDiscountPct).toBe(6.06)
  })

  it('pipeline lists every stage, empty ones included', () => {
    expect(o.pipeline.map((p) => p.stage)).toEqual(['draft', 'pending_approval', 'approved', 'sent', 'under_negotiation', 'confirmed'])
    expect(o.pipeline.find((p) => p.stage === 'sent')).toEqual({ stage: 'sent', count: 1, value: 500 })
    expect(o.pipeline.find((p) => p.stage === 'approved')).toEqual({ stage: 'approved', count: 0, value: 0 })
  })

  it('revenue covers the last six months, oldest first, with empty months', () => {
    expect(o.revenue.map((r) => r.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(o.revenue.at(-2)!.amount).toBe(400)
    expect(o.revenue.at(-1)!.amount).toBe(250)
    expect(o.revenue[0].amount).toBe(0)
  })

  it('says "unknown" rather than 0% when there is nothing to measure', () => {
    const empty = buildOverview([], [], now)
    expect(empty.kpis.winRate90d).toBeNull()
    expect(empty.kpis.avgDiscountPct).toBeNull()
    expect(empty.kpis.openPipeline).toBe(0)
  })
})
