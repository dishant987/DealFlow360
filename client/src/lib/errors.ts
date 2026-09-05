import { AxiosError } from 'axios'

/**
 * Always return a plain string for toasts.
 * The API returns Zod issue ARRAYS for validation failures — passing one to
 * toast() renders objects as React children and crashes the page.
 */
export function errText(e: unknown, fallback = 'Something went wrong'): string {
  const data = e instanceof AxiosError ? e.response?.data : undefined
  const err = (data as { error?: unknown })?.error

  if (typeof err === 'string') return err

  // zod: [{ path: ['quantity'], message: 'Required' }, …]
  if (Array.isArray(err)) {
    const parts = err
      .map((i) => {
        const issue = i as { path?: unknown[]; message?: string }
        const field = Array.isArray(issue.path) ? issue.path.join('.') : ''
        return [field, issue.message].filter(Boolean).join(': ')
      })
      .filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}
