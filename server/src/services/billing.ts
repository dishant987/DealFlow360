// Billing math (brief A5/B7) — pure, no DB.
export type Interval = 'monthly' | 'quarterly' | 'yearly'

export const intervalMonths = (i: Interval) => (i === 'monthly' ? 1 : i === 'quarterly' ? 3 : 12)

// Add months without letting a short month overflow: Date.setMonth turns
// Jan 31 + 1 month into Mar 3, which silently skips a whole billing period.
// A billing day past the end of the target month clamps to that month's last day.
function addMonthsClamped(from: Date, months: number): Date {
  const d = new Date(from)
  const billingDay = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDayOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(billingDay, lastDayOfTarget))
  return d
}

export const nextBillingDate = (from: Date, i: Interval): Date =>
  addMonthsClamped(from, intervalMonths(i))

// Real calendar length of the period ENDING at nextBilling, so a 31-day month
// prorates against 31 days and a leap February against 29 — not a nominal 30.
export const periodDays = (nextBilling: Date, i: Interval): number =>
  daysBetween(addMonthsClamped(nextBilling, -intervalMonths(i)), nextBilling)

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

const round2 = (x: number) => Math.round(x * 100) / 100

// charge/credit for the unused remainder of the current period
export function proratedAmount(amount: number, daysRemaining: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0
  return round2((amount * Math.min(Math.max(daysRemaining, 0), daysInPeriod)) / daysInPeriod)
}

// What a payment does to an invoice. A partial payment leaves the invoice open —
// only one that clears the balance settles it. Omitting `amount` pays the balance.
export function applyPayment(invoiceAmount: number, alreadyPaid: number, amount?: number) {
  const outstanding = round2(invoiceAmount - alreadyPaid)
  const paid = round2(amount ?? outstanding)
  const paidTotal = round2(alreadyPaid + paid)
  return {
    outstanding,
    amount: paid,
    paidTotal,
    settled: paidTotal >= invoiceAmount,
    balance: round2(invoiceAmount - paidTotal),
  }
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
