// One source of truth for status colours, so a status looks identical on every
// screen. Covers quotation, invoice and billing-schedule statuses. Every tone has
// a dark-mode variant so badges stay readable on both themes.
type Tone = 'slate' | 'amber' | 'emerald' | 'red' | 'sky' | 'violet' | 'teal' | 'brand'
const TONE_CLASS: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  brand: 'bg-accent text-accent-foreground',
}
const TONES: Record<string, Tone> = {
  // quotation lifecycle
  draft: 'slate',
  pending_approval: 'amber',
  approved: 'emerald',
  rejected: 'red',
  cancelled: 'red',
  sent: 'sky',
  under_negotiation: 'violet',
  confirmed: 'teal',
  fulfilled: 'emerald',
  invoiced: 'brand',
  // invoices
  paid: 'emerald',
  overdue: 'red',
  void: 'slate',
  // billing schedules
  scheduled: 'emerald',
  billed: 'sky',
  // fulfillment states
  awaiting: 'sky',
  partial: 'amber',
  complete: 'emerald',
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
  const tone = TONE_CLASS[TONES[status] ?? 'slate']
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tone} ${className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
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
  invoiced: '#4652C8',
}
export const statusColor = (status: string) => CHART[status] ?? '#94a3b8'
