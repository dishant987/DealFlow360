import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

type Detail = {
  id: string
  customer: string
  customerTier: string
  status: string
  riskScore: string
  requiresManager: boolean
  requiresFinance: boolean
  yourStep: 'manager' | 'finance' | null
  risk: { score: number; breaches: { index: number; discountPct: number; ceiling: number; overBy: number }[] } | null
  steps: {
    id: string
    step: string
    action: string | null
    reason: string | null
    approver: string | null
    createdAt: string
  }[]
  audit: { id: string; action: string; reason: string | null; user: string | null; createdAt: string }[]
}

const badge = (action: string | null) =>
  action === 'approve'
    ? 'bg-emerald-100 text-emerald-800'
    : action === 'reject'
      ? 'bg-red-100 text-red-800'
      : action === 'return'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-muted text-foreground'

export default function ApprovalDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const detail = useQuery({
    queryKey: ['approval', id],
    queryFn: async () => (await api.get(`/approvals/${id}`)).data as Detail,
  })

  const act = async (action: 'approve' | 'reject' | 'return') => {
    if ((action === 'reject' || action === 'return') && !reason.trim()) {
      toast.error('Please add a reason')
      return
    }
    setBusy(true)
    try {
      await api.post(`/approvals/${id}/action`, { action, reason: reason || undefined })
      toast.success(`Quotation ${action}d`)
      qc.invalidateQueries({ queryKey: ['approvals'] })
      nav('/approvals')
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (detail.isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>
  if (!detail.data) return <div className="p-8 text-destructive">Not found.</div>
  const d = detail.data

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">
          Approval · {d.customer}{' '}
          <span className="opacity-80 text-xs uppercase">({d.customerTier})</span>
        </span>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/approvals">Back</Link>
        </Button>
      </header>

      <main className="p-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-6">
          {/* risk */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Blended risk score</h2>
              <span className="text-lg font-semibold">{Number(d.riskScore).toFixed(1)}</span>
            </div>
            {d.risk && d.risk.breaches.length > 0 ? (
              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                {d.risk.breaches.map((b) => (
                  <li key={b.index}>
                    Line {b.index + 1}: {b.discountPct}% given vs {b.ceiling}% allowed —{' '}
                    <span className="text-red-600">{b.overBy} over</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No line over its ceiling.</p>
            )}
          </div>

          {/* approval steps */}
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold mb-3">Approval steps</h2>
            <div className="flex flex-wrap gap-3">
              {d.steps.map((s) => (
                <div key={s.id} className="rounded border px-3 py-2 text-sm">
                  <div className="font-medium capitalize">{s.step}</div>
                  <span className={`rounded px-2 py-0.5 text-xs ${badge(s.action)}`}>
                    {s.action ?? 'pending'}
                  </span>
                  {s.approver && <div className="text-xs text-muted-foreground mt-1">{s.approver}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* audit trail */}
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold mb-3">Audit trail</h2>
            <ul className="text-sm space-y-2">
              {d.audit.map((a) => (
                <li key={a.id} className="flex justify-between gap-4">
                  <span>
                    <span className="font-medium">{a.action}</span>
                    {a.reason && <span className="text-muted-foreground"> — {a.reason}</span>}
                    {a.user && <span className="text-muted-foreground"> · {a.user}</span>}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* action panel */}
        <aside className="space-y-3 rounded-lg border p-4 h-fit">
          <h2 className="font-semibold">
            Decision {d.yourStep && <span className="text-muted-foreground text-sm">({d.yourStep})</span>}
          </h2>
          {d.status !== 'pending_approval' ? (
            <p className="text-sm text-muted-foreground">
              This quotation is <b>{d.status.replace(/_/g, ' ')}</b>.
            </p>
          ) : !d.yourStep ? (
            <p className="text-sm text-muted-foreground">
              Waiting on another approver — no action for you right now.
            </p>
          ) : (
            <>
              <textarea
                className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
                rows={3}
                placeholder="Reason (required for reject / return)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button className="w-full" disabled={busy} onClick={() => act('approve')}>
                Approve
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                disabled={busy}
                onClick={() => act('return')}
              >
                Return for revision
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                disabled={busy}
                onClick={() => act('reject')}
              >
                Reject
              </Button>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
