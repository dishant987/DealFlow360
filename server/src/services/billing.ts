// Billing math (brief A5/B7) — pure, no DB.
export type Interval = 'monthly' | 'quarterly' | 'yearly'

export const intervalMonths = (i: Interval) => (i === 'monthly' ? 1 : i === 'quarterly' ? 3 : 12)
export const intervalDays = (i: Interval) => (i === 'monthly' ? 30 : i === 'quarterly' ? 91 : 365)

export function nextBillingDate(from: Date, i: Interval): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + intervalMonths(i))
  return d
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

const round2 = (x: number) => Math.round(x * 100) / 100

// charge/credit for the unused remainder of the current period
export function proratedAmount(amount: number, daysRemaining: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0
  return round2((amount * Math.min(Math.max(daysRemaining, 0), daysInPeriod)) / daysInPeriod)
}

// partial refund on cancellation = prorated unused portion × refund%
export function refundAmount(
  periodAmount: number,
  daysRemaining: number,
  daysInPeriod: number,
  refundPct: number,
): number {
  return round2((proratedAmount(periodAmount, daysRemaining, daysInPeriod) * refundPct) / 100)
}
