import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export type Command = { id: string; label: string; group: string; icon: LucideIcon; to: string; keywords?: string }

/**
 * Ctrl/⌘ K jump-to-anything. Commands come from the shell so the palette only
 * offers what the signed-in role can open.
 */
export default function CommandPalette({
  commands,
  open,
  onOpenChange,
}: {
  commands: Command[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q))
  }, [commands, query])

  const go = (c: Command | undefined) => {
    if (!c) return
    onOpenChange(false)
    setQuery('')
    nav(c.to)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery('')
      }}
    >
      <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search Dealwise</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(results[active])
              }
            }}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{query}”.</li>
          )}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                }`}
              >
                <c.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.group}</span>
                {i === active && <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
