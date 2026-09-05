// Blended discount risk score (brief §10) — pure, no DB.
//
// Each line is checked against ITS OWN effective ceiling = min(tier ceiling,
// category ceiling). A line's "over by" is how many points its discount exceeds
// that ceiling. The blended score is the SUM of every line's overage — so one
// badly-over line OR many slightly-over lines both raise it. Two configurable
// thresholds decide the approval level.

export interface RiskLineInput {
  discountPct: number
  ceiling: number // effective ceiling for this line = min(tier, category)
}

export interface RiskThresholds {
  managerThreshold: number // score above this → manager approval
  financeThreshold: number // score above this → also finance approval
}

export interface RiskResult {
  score: number
  breaches: { index: number; discountPct: number; ceiling: number; overBy: number }[]
  requiresManager: boolean
  requiresFinance: boolean
  level: 'none' | 'manager' | 'finance'
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function computeBlendedRisk(
  lines: RiskLineInput[],
  { managerThreshold, financeThreshold }: RiskThresholds,
): RiskResult {
  const breaches: RiskResult['breaches'] = []
  let score = 0
  lines.forEach((l, index) => {
    const overBy = Math.max(0, l.discountPct - l.ceiling)
    if (overBy > 0) {
      breaches.push({ index, discountPct: l.discountPct, ceiling: l.ceiling, overBy: round2(overBy) })
      score += overBy
    }
  })
  score = round2(score)

  const requiresFinance = score > financeThreshold
  const requiresManager = requiresFinance || score > managerThreshold
  const level = requiresFinance ? 'finance' : requiresManager ? 'manager' : 'none'
  return { score, breaches, requiresManager, requiresFinance, level }
}
