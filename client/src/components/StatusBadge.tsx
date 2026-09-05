// One source of truth for status colours, so a status looks identical on every
// screen. Covers quotation, invoice and billing-schedule statuses.
const TONES: Record<string, string> = {
  // quotation lifecycle
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  sent: 'bg-sky-100 text-sky-800',
  under_negotiation: 'bg-violet-100 text-violet-800',
  confirmed: 'bg-teal-100 text-teal-800',
  fulfilled: 'bg-emerald-100 text-emerald-800',
  invoiced: 'bg-primary/10 text-primary',
  // invoices
  paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-100 text-red-800',
  void: 'bg-slate-100 text-slate-500',
  // billing schedules
  scheduled: 'bg-emerald-100 text-emerald-800',
  billed: 'bg-sky-100 text-sky-800',
  // fulfillment states
  awaiting: 'bg-sky-100 text-sky-800',
  partial: 'bg-amber-100 text-amber-800',
  complete: 'bg-emerald-100 text-emerald-800',
}

export default function StatusBadge({
  status,
  label,
  className = '',
}: {
  status: string
  /** override the visible text while keeping the status colour */
  label?: string
  className?: string
}) {
  const tone = TONES[status] ?? 'bg-slate-100 text-slate-700'
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${tone} ${className}`}
    >
      {(label ?? status).replace(/_/g, ' ')}
    </span>
  )
}

// Solid equivalents of the badge tones, for charts (recharts needs a fill value).
const CHART: Record<string, string> = {
  draft: '#94a3b8',
  pending_approval: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  cancelled: '#ef4444',
  sent: '#0ea5e9',
  under_negotiation: '#8b5cf6',
  confirmed: '#14b8a6',
  fulfilled: '#10b981',
  invoiced: '#714B67',
}
export const statusColor = (status: string) => CHART[status] ?? '#94a3b8'
