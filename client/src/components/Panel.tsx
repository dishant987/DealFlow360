import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The standard bordered surface. Card containers had drifted into ten variants
 * (rounded-lg vs rounded-xl, p-4 vs p-5, with and without bg-background); this
 * settles on one so panels line up across pages.
 */
export default function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  /** control on the right of the header row */
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const hasHeader = !!(title || action)
  return (
    <section className={cn('rounded-xl border bg-background', className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
          <div className="min-w-0">
            {title && <h2 className="font-heading font-medium">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={cn(hasHeader ? 'p-4' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
