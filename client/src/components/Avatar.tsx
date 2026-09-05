import { cn } from '@/lib/utils'

/** Initials circle. There are no uploaded avatars in this app, so the initials
 *  are the whole thing — no image/fallback machinery needed. */
export function initialsOf(name?: string | null) {
  const parts = (name ?? '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function Avatar({
  name,
  className,
}: {
  name?: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary select-none',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
