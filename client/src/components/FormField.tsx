import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/** Label + control + error, wired for screen readers. */
export default function FormField({
  id,
  label,
  error,
  action,
  children,
}: {
  id: string
  label: string
  error?: string
  /** optional control on the right of the label row, e.g. a "Forgot?" link */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
