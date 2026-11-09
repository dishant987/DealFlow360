// One place for how money and raw values look in the UI.

// shortcut: one display currency per page, set when the session (or a portal quote) loads; pass it explicitly if a page ever shows two
let currency = 'USD'
const LOCALE: Record<string, string> = { INR: 'en-IN' } // lakh/crore grouping
export function setCurrency(c: string | null | undefined) {
  if (c) currency = c
}

/** 1000 -> "$1,000.00" (or "₹1,000.00", "€1,000.00"… in the company's currency); accepts numeric strings. */
export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency }).format(Number(n ?? 0))

const LABELS: Record<string, string> = {
  onetime: 'One-time',
  pending_approval: 'Pending approval',
  under_negotiation: 'Under negotiation',
}
/** Raw values as people read them: "onetime" -> "One-time", "stock_received" -> "Stock received". */
export function humanize(v: string | null | undefined) {
  if (!v) return ''
  if (LABELS[v]) return LABELS[v]
  const s = v.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The currencies offered in pickers (any ISO code works server-side). */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'CHF', 'ZAR', 'SAR'] as const
