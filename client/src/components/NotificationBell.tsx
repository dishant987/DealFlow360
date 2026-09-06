import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, BadgeCheck, MessageSquare, Receipt, Truck, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

type Kind = 'approval' | 'customer' | 'fulfillment' | 'billing' | 'alert'
type Notification = {
  id: string
  kind: Kind
  title: string
  reason: string | null
  actor: string
  quotationId: string
  quoteNumber: string
  customer: string
  status: string
  createdAt: string
}

const icon: Record<Kind, typeof Bell> = {
  approval: BadgeCheck,
  customer: MessageSquare,
  fulfillment: Truck,
  billing: Receipt,
  alert: TriangleAlert,
}
const tone: Record<Kind, string> = {
  approval: 'text-emerald-600',
  customer: 'text-primary',
  fulfillment: 'text-sky-600',
  billing: 'text-violet-600',
  alert: 'text-amber-600',
}

// Read state is a per-browser "last seen" stamp rather than a row per user per
// notification. The events themselves are the audit trail, which is immutable —
// so all that is actually needed is where each person got up to.
// ponytail: per-browser, not per-account; a `notification_reads` table is the
// upgrade if people start reading on two machines and want it to follow them.
const seenKey = (userId: string) => `notifications.lastSeen.${userId}`

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState(() =>
    user ? (localStorage.getItem(seenKey(user.id)) ?? '') : '',
  )

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data as Notification[],
    enabled: !!user,
    staleTime: 30_000,
  })

  const items = useMemo(() => list.data ?? [], [list.data])
  const unread = useMemo(
    () => items.filter((n) => !lastSeen || n.createdAt > lastSeen),
    [items, lastSeen],
  )

  const markAllRead = () => {
    if (!user) return
    // stamp against the newest item, not `now` — anything that lands between
    // the fetch and the click stays unread instead of being silently swallowed
    const newest = items[0]?.createdAt ?? new Date().toISOString()
    localStorage.setItem(seenKey(user.id), newest)
    setLastSeen(newest)
  }

  const openItem = (n: Notification) => {
    setOpen(false)
    markAllRead()
    nav(`/quotations/${n.quotationId}`)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`}
        className="relative rounded-md p-1.5 text-primary-foreground/85 transition-colors hover:bg-white/10 hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
      >
        <Bell className="size-4" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-amber-400 px-1 text-[10px] leading-4 font-semibold text-amber-950 tabular-nums">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {list.isLoading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!list.isLoading && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing yet — you're all caught up.
            </p>
          )}
          {items.map((n) => {
            const Icon = icon[n.kind]
            const isUnread = !lastSeen || n.createdAt > lastSeen
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={`flex w-full gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted ${
                  isUnread ? 'bg-primary/5' : ''
                }`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone[n.kind]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">{n.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {n.quoteNumber} · {n.customer} · {n.actor}
                  </span>
                  {n.reason && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground italic">
                      “{n.reason}”
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                  {ago(n.createdAt)}
                </span>
              </button>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
