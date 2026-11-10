import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover as P } from 'radix-ui'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/hooks/useDebounced'

export type ComboOption = { value: string; label: string; hint?: string; group?: string }

const SHOWN = 100 // shortcut: filters in the browser and shows the first 100 matches; switch to a server search once lists reach thousands

/**
 * Autocomplete for lists that come from the server (customers, products, people…):
 * type in the field to filter (debounced), ↑ ↓ + Enter to pick, Esc to cancel, × to clear.
 * Leaving the field without picking keeps the previous value. The input carries `id`,
 * so <FormField> labels point at it.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  clearLabel,
  searchPlaceholder,
  loading,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  placeholder?: string
  /** allows an empty value, shown as this first option (e.g. "No owner", "All customers") and a × button */
  clearLabel?: string
  /** placeholder while typing; defaults to the current value */
  searchPlaceholder?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const [query, setQuery] = useState<string | null>(null) // null = not editing
  const term = useDebounced((query ?? '').trim().toLowerCase(), 150)
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const open = query !== null

  const all = useMemo(() => (clearLabel ? [{ value: '', label: clearLabel }, ...options] : options), [options, clearLabel])
  const matches = useMemo(
    () => (term ? all.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(term)) : all),
    [all, term],
  )
  const shown = matches.slice(0, SHOWN)
  const selected = all.find((o) => o.value === value)

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (o: ComboOption) => {
    onChange(o.value)
    setQuery(null)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setQuery('')
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault()
      choose(shown[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation() // close the list, not the dialog around it
      setQuery(null)
    }
  }

  return (
    <P.Root open={open && !disabled} onOpenChange={(o) => !o && setQuery(null)}>
      <P.Anchor asChild>
        <div className={cn('relative flex w-full min-w-0 items-center', className)}>
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
            aria-label={ariaLabel}
            data-slot="select"
            autoComplete="off"
            disabled={disabled}
            value={query ?? (value ? (selected?.label ?? '') : '')}
            placeholder={open ? (searchPlaceholder ?? selected?.label ?? placeholder) : placeholder}
            // focus alone doesn't open the list (dialogs auto-focus their first field); it selects the
            // text so typing replaces it. Clicking, typing or ↓ opens it.
            onFocus={(e) => e.currentTarget.select()}
            onClick={() => {
              if (query === null) {
                setQuery('')
                setActive(0)
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onBlur={() => setQuery(null)}
            onKeyDown={onKey}
            className={cn(
              'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-14 pl-2.5 text-base outline-none transition-colors md:text-sm',
              'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className?.includes('text-xs') && 'md:text-xs',
            )}
          />
          <span className="pointer-events-none absolute right-2 flex items-center gap-1 text-muted-foreground">
            {clearLabel && value && !disabled && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Clear — ${clearLabel}`}
                className="pointer-events-auto grid size-5 place-items-center rounded hover:bg-muted hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()} // keep the input's blur from racing the click
                onClick={() => choose({ value: '', label: clearLabel })}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
            <ChevronDown className="size-4" aria-hidden />
          </span>
        </div>
      </P.Anchor>
      {/* no portal: inside a dialog, its focus trap and scroll lock would fight a portalled list */}
      <P.Content
        role="presentation" // the list inside is the popup (listbox); this wrapper is not a dialog
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()} // focus stays in the field you're typing in
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.parentElement?.contains(e.target as Node)) e.preventDefault()
        }}
        className="z-50 w-(--radix-popover-trigger-width) min-w-60 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      >
        <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel ?? placeholder} className="max-h-64 overflow-y-auto p-1">
          {loading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
          {!loading && shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches for “{query}”</li>}
          {shown.map((o, i) => (
            <li key={o.value || '__clear'} role="presentation">
              {o.group && o.group !== shown[i - 1]?.group && (
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{o.group}</div>
              )}
              <div
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onClick={() => choose(o)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                  !o.value && 'text-muted-foreground',
                )}
              >
                <Check className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </div>
            </li>
          ))}
          {matches.length > SHOWN && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              Showing {SHOWN} of {matches.length} — keep typing to narrow down.
            </li>
          )}
        </ul>
      </P.Content>
    </P.Root>
  )
}
