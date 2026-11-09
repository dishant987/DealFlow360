import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { roleLabel } from '@/lib/roles'
import { deviceName, type Session } from '@/lib/device'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import Panel from '@/components/Panel'
import PageSkeleton from '@/components/PageSkeleton'
import StatusBadge from '@/components/StatusBadge'
import ConfirmButton from '@/components/ConfirmButton'
import FormField from '@/components/FormField'
import { Select } from '@/components/ui/select'

type Detail = {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'invited' | 'blocked'
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  mfaEnabled: boolean
  createdAt: string
  owns: { quotations: number; openQuotations: number; customers: number }
  sessions: Session[]
}
type Member = { id: string; name: string; status: string }

const ago = (d: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : 'Never')

export default function UserDetail() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [toUser, setToUser] = useState('')
  const q = useQuery({ queryKey: ['team-user', id], queryFn: async () => (await api.get(`/config/users/${id}`)).data as Detail })
  const team = useQuery({ queryKey: ['/config/users'], queryFn: async () => (await api.get('/config/users')).data as Member[] })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['team-user', id] })

  const signOut = useMutation({
    mutationFn: () => api.post(`/config/users/${id}/sign-out`),
    onSuccess: () => (toast.success('Signed out of every device.'), refresh()),
    onError: (e) => toast.error(errText(e, "Couldn't sign them out")),
  })
  const transfer = useMutation({
    mutationFn: async () => (await api.post(`/config/users/${id}/transfer`, { toUserId: toUser })).data as { quotations: number; customers: number },
    onSuccess: (r) => {
      toast.success(`Moved ${r.quotations} quotation(s) and ${r.customers} customer(s).`)
      setToUser('')
      refresh()
    },
    onError: (e) => toast.error(errText(e, 'Transfer failed')),
  })

  const u = q.data
  if (!u) return <AppShell crumbs={[{ label: 'Settings', to: '/admin' }, { label: 'User' }]}>{q.isError ? <p className="text-sm text-muted-foreground">User not found.</p> : <PageSkeleton />}</AppShell>

  const live = u.sessions.filter((s) => !s.revokedAt)
  const others = (team.data ?? []).filter((m) => m.id !== u.id && m.status === 'active')
  const nothingOwned = u.owns.quotations + u.owns.customers === 0
  const facts: [string, string][] = [
    ['Role', roleLabel(u.role)],
    ['Last sign-in', ago(u.lastLoginAt)],
    ['Joined', format(new Date(u.createdAt), 'd MMM yyyy')],
    ['Email', u.emailVerifiedAt ? 'Verified' : 'Not verified yet'],
    ['Two-factor', u.mfaEnabled ? 'On' : 'Off'],
  ]

  return (
    <AppShell crumbs={[{ label: 'Settings', to: '/admin' }, { label: u.name }]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold">{u.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
          </div>
          <StatusBadge status={u.status} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <Panel title="Account">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {u.status === 'invited' && (
              <p className="mt-3 text-sm text-muted-foreground">Hasn't joined yet. Use Invite on the Users list to send a fresh link.</p>
            )}
          </Panel>

          <Panel title="Work they own" description="Hand it to a teammate before someone leaves or changes role.">
            <ul className="mb-4 space-y-1 text-sm">
              <li>
                <strong className="tabular-nums">{u.owns.quotations}</strong> quotations ({u.owns.openQuotations} still open)
              </li>
              <li>
                <strong className="tabular-nums">{u.owns.customers}</strong> customers
              </li>
            </ul>
            {nothingOwned ? (
              <p className="text-sm text-muted-foreground">Nothing to hand over.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <FormField id="transfer-to" label="Give it all to">
                  <Select id="transfer-to" value={toUser} onChange={(e) => setToUser(e.target.value)}>
                    <option value="">Choose a teammate…</option>
                    {others.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <ConfirmButton
                  disabled={!toUser || transfer.isPending}
                  confirmLabel="Transfer"
                  destructive={false}
                  title="Transfer all their work?"
                  description={`Every quotation and customer owned by ${u.name} moves to ${others.find((m) => m.id === toUser)?.name ?? 'the teammate you picked'}.`}
                  onConfirm={() => transfer.mutate()}
                >
                  Transfer
                </ConfirmButton>
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Signed-in devices"
          description={`${live.length} active · sign-ins and sign-outs from the last 20 sessions.`}
          action={
            live.length > 0 &&
            u.id !== me?.id && (
              <ConfirmButton size="sm" variant="outline" confirmLabel="Sign out" destructive={false} title={`Sign ${u.name} out everywhere?`} description="Every device is signed out at once, including live tabs." onConfirm={() => signOut.mutate()}>
                Sign out everywhere
              </ConfirmButton>
            )
          }
        >
          {u.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm" aria-label="Devices">
              {u.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <span className="font-medium">{deviceName(s.userAgent)}</span>
                  <span className="text-muted-foreground">{s.ip ?? ''}</span>
                  <span className="ml-auto text-muted-foreground">
                    {s.revokedAt ? `Signed out ${ago(s.revokedAt)}` : `Active ${ago(s.lastSeenAt)}`} · signed in {format(new Date(s.createdAt), 'd MMM, HH:mm')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  )
}
