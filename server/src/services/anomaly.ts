// Discount-anomaly detection (brief B9) — pure, no DB.
// Flags a quote whose risk score is well above that rep's own historical average
// (so a rep who normally discounts hard isn't flagged for their baseline, but a
// sudden spike is). A floor avoids flagging tiny scores in low-discount reps.

export interface QuoteScore {
  id: string
  repId: string
  riskScore: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function findDiscountAnomalies(
  quotes: QuoteScore[],
  factor = 2,
  floor = 6,
): { id: string; riskScore: number; repAvg: number }[] {
  const byRep = new Map<string, number[]>()
  for (const q of quotes) {
    const arr = byRep.get(q.repId) ?? []
    arr.push(q.riskScore)
    byRep.set(q.repId, arr)
  }
  const mean = new Map(
    [...byRep].map(([rep, vals]) => [rep, vals.reduce((a, b) => a + b, 0) / vals.length]),
  )

  return quotes
    .filter((q) => q.riskScore > floor && q.riskScore > (mean.get(q.repId) ?? 0) * factor)
    .map((q) => ({ id: q.id, riskScore: q.riskScore, repAvg: round2(mean.get(q.repId) ?? 0) }))
}
