import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Laptop, Smartphone, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { deviceName, ipLabel, type Session } from '@/lib/device'
import { Button } from '@/components/ui/button'

const SHOWN = 5

function DeviceIcon({ ua }: { ua: string | null }) {
  const Icon = !ua || !/Mozilla\//.test(ua) ? TerminalSquare : /Android|iPhone|iPad|Mobile/.test(ua) ? Smartphone : Laptop
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
}

/** Your own signed-in devices, with sign-out for any you don't recognise. */
export default function DevicesCard() {
  const qc = useQueryClient()
  const [all, setAll] = useState(false)
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: async () => (await api.get('/auth/sessions')).data as Session[] })
  const done = (msg: string) => () => (toast.success(msg), void qc.invalidateQueries({ queryKey: ['my-sessions'] }))
  const fail = (e: unknown) => toast.error(errText(e, "Couldn't sign that device out"))
  const one = useMutation({ mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`), onSuccess: done('Device signed out.'), onError: fail })
  const others = useMutation({ mutationFn: () => api.post('/auth/sessions/revoke-others'), onSuccess: done('Signed out of every other device.'), onError: fail })

  // this device first, then most recently active
  const rows = [...(q.data ?? [])].sort((a, b) => Number(!!b.current) - Number(!!a.current))
  const visible = all ? rows : rows.slice(0, SHOWN)

  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading font-medium">Signed-in devices</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length ? `${rows.length} active ${rows.length === 1 ? 'session' : 'sessions'} in the last 7 days.` : 'Where you are signed in.'}
          </p>
        </div>
        {rows.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => others.mutate()} disabled={others.isPending}>
            Sign out all other devices
          </Button>
        )}
      </div>

      <ul className="mt-4 divide-y rounded-lg border" aria-label="Your devices">
        {visible.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <DeviceIcon ua={s.userAgent} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {deviceName(s.userAgent)}
                {s.current && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">This device</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {s.current ? 'Active now' : `Active ${formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}`} · {ipLabel(s.ip)}
              </p>
            </div>
            {!s.current && (
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => one.mutate(s.id)} disabled={one.isPending}>
                Sign out
              </Button>
            )}
          </li>
        ))}
        {q.isSuccess && rows.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">Sign in again to see your devices here.</li>}
      </ul>
      {rows.length > SHOWN && (
        <Button size="sm" variant="link" className="mt-2 h-auto px-0" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </section>
  )
}
