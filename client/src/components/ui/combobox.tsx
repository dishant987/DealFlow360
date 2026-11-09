import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover as P } from 'radix-ui'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/hooks/useDebounced'

export type ComboOption = { value: string; label: string; hint?: string; group?: string }

const SHOWN = 100 // shortcut: filters in the browser and shows the first 100 matches; switch to a server search once lists reach thousands

/**
 * Searchable picker for lists that come from the server (customers, products,
 * people…). Type to filter (debounced), arrows + Enter to pick, Esc to close.
 * The trigger carries `id`, so <FormField> labels still point at it.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  clearLabel,
  searchPlaceholder = 'Search…',
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
  /** adds a first option with the empty value, e.g. "No owner" or "All customers" */
  clearLabel?: string
  searchPlaceholder?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const term = useDebounced(text.trim().toLowerCase(), 200)
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

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
    setOpen(false)
    setText('')
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && shown[active]) {
      e.preventDefault()
      choose(shown[active])
    }
  }
  const onOpenChange = (o: boolean) => {
    setOpen(o)
    setActive(0)
    if (!o) setText('')
  }

  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          data-slot="select"
          className={cn(
            'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-left text-base outline-none transition-colors md:text-sm',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('flex-1 truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </P.Trigger>
      {/* no portal: inside a dialog, its focus trap would block the search box */}
        <P.Content
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-60 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          onOpenAutoFocus={(e) => (e.preventDefault(), (e.currentTarget as HTMLElement).querySelector('input')?.focus())}
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={text}
              onChange={(e) => (setText(e.target.value), setActive(0))}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {loading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
            {!loading && shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>}
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
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
                  onClick={() => choose(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    i === active && 'bg-accent text-accent-foreground',
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
                Showing {SHOWN} of {matches.length} — type to narrow down.
              </li>
            )}
          </ul>
        </P.Content>
    </P.Root>
  )
}
