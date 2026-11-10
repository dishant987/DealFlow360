import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StepState = 'done' | 'current' | 'upcoming' | 'skipped' | 'stopped'
export type Step = { key: string; label: ReactNode; detail?: string; state: StepState }

/**
 * Progress through a process: done ✓, the current step highlighted ("you are here"),
 * upcoming, skipped (passed over), or stopped (rejected / cancelled).
 * Horizontal from `sm` up, vertical on a phone.
 */
export default function Stepper({ steps, label, className }: { steps: Step[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('flex flex-col gap-0 sm:flex-row', className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        // the line after a step is "filled" once the process has moved past it
        const filled = s.state === 'done' || s.state === 'skipped'
        return (
          <li
            key={s.key}
            aria-current={s.state === 'current' ? 'step' : undefined}
            className="relative flex flex-1 gap-3 pb-5 last:pb-0 sm:flex-col sm:gap-2 sm:pr-3 sm:pb-0"
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-6 bottom-0 left-[11px] w-0.5 sm:top-[11px] sm:right-0 sm:bottom-auto sm:left-7 sm:h-0.5 sm:w-auto',
                  filled ? 'bg-emerald-500' : 'bg-border',
                  s.state === 'skipped' && 'bg-transparent bg-[linear-gradient(to_right,var(--color-emerald-500)_50%,transparent_0)] bg-[length:6px_2px] max-sm:bg-[linear-gradient(to_bottom,var(--color-emerald-500)_50%,transparent_0)] max-sm:bg-[length:2px_6px]',
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                s.state === 'done' && 'bg-emerald-500 text-white',
                s.state === 'current' && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                s.state === 'upcoming' && 'border-2 border-border bg-background text-muted-foreground',
                s.state === 'skipped' && 'border-2 border-dashed border-muted-foreground/40 bg-background text-muted-foreground',
                s.state === 'stopped' && 'bg-destructive text-white ring-4 ring-destructive/20',
              )}
            >
              {s.state === 'done' ? <Check className="size-3.5" /> : s.state === 'stopped' ? <X className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-sm leading-tight',
                  s.state === 'current' && 'font-semibold text-primary',
                  s.state === 'stopped' && 'font-semibold text-destructive',
                  s.state === 'done' && 'font-medium',
                  (s.state === 'upcoming' || s.state === 'skipped') && 'text-muted-foreground',
                )}
              >
                {s.label}
                {s.state === 'current' && <span className="sr-only"> (current step)</span>}
              </span>
              {s.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{s.detail}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** From "which steps are finished" to step states: the first unfinished one is current; unfinished ones before a finished one were skipped. */
export function toSteps(items: { key: string; label: ReactNode; done: boolean; detail?: string }[], stopped = false): Step[] {
  const lastDone = items.map((x) => x.done).lastIndexOf(true)
  let currentGiven = false
  return items.map((x, i) => {
    let state: StepState
    if (x.done) state = 'done'
    else if (i < lastDone) state = 'skipped'
    else if (!currentGiven) {
      state = stopped ? 'stopped' : 'current'
      currentGiven = true
    } else state = 'upcoming'
    return { key: x.key, label: x.label, detail: x.detail, state }
  })
}
