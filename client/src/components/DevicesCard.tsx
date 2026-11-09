import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { deviceName, type Session } from '@/lib/device'
import { Button } from '@/components/ui/button'

/** Your own signed-in devices, with sign-out for any you don't recognise. */
export default function DevicesCard() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: async () => (await api.get('/auth/sessions')).data as Session[] })
  const done = (msg: string) => () => (toast.success(msg), void qc.invalidateQueries({ queryKey: ['my-sessions'] }))
  const fail = (e: unknown) => toast.error(errText(e, "Couldn't sign that device out"))
  const one = useMutation({ mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`), onSuccess: done('Device signed out.'), onError: fail })
  const others = useMutation({ mutationFn: () => api.post('/auth/sessions/revoke-others'), onSuccess: done('Signed out of every other device.'), onError: fail })
  const rows = q.data ?? []

  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading font-medium">Signed-in devices</h2>
        {rows.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => others.mutate()} disabled={others.isPending}>
            Sign out all other devices
          </Button>
        )}
      </div>
      <ul className="mt-3 divide-y text-sm" aria-label="Your devices">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-medium">{deviceName(s.userAgent)}</span>
            {s.current ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">This device</span>
            ) : (
              <span className="text-muted-foreground">active {formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}</span>
            )}
            <span className="text-muted-foreground">{s.ip ?? ''}</span>
            {!s.current && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => one.mutate(s.id)} disabled={one.isPending}>
                Sign out
              </Button>
            )}
          </li>
        ))}
        {q.isSuccess && rows.length === 0 && <li className="py-2 text-muted-foreground">Sign in again to see your devices here.</li>}
      </ul>
    </section>
  )
}
