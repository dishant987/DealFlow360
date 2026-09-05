import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Native select styled to match Input. Raw <select>s were drifting from the
 * text fields beside them — taller, squarer corners, no focus ring, and the
 * browser's own chevron. The element stays native so keyboard and mobile
 * behaviour is unchanged; only the chrome is ours.
 */
function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative inline-flex items-center">
      <select
        data-slot="select"
        className={cn(
          'h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
          'md:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground"
      />
    </span>
  )
}

export { Select }
