import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The metric tile used across Workspace, Invoices, Subscriptions, Fulfillment,
 * Deal Health and Reports. These were five near-identical copies with slightly
 * different padding and type scales; this is the single version.
 */
export default function StatCard({
  label,
  value,
  hint,
  to,
  tone = 'default',
  loading = false,
  className,
}: {
  label: string
  value: ReactNode
  /** small line under the value, for context rather than decoration */
  hint?: ReactNode
  /** makes the whole tile a link */
  to?: string
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success'
  loading?: boolean
  className?: string
}) {
  const valueTone = {
    default: 'text-foreground',
    primary: 'text-primary',
    warning: 'text-amber-600',
    danger: 'text-destructive',
    success: 'text-emerald-600',
  }[tone]

  const body = (
    <>
      <div className="text-sm text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-8 w-16" />
      ) : (
        <div className={cn('mt-0.5 text-3xl font-semibold tabular-nums', valueTone)}>{value}</div>
      )}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  )

  const base = 'rounded-xl border bg-background p-4'
  if (!to) return <div className={cn(base, className)}>{body}</div>
  return (
    <Link
      to={to}
      className={cn(
        base,
        'block transition-colors hover:border-primary/40 hover:bg-muted/30',
        className,
      )}
    >
      {body}
    </Link>
  )
}
