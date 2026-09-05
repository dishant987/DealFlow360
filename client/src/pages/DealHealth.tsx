import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'

type Stalled = { id: string; quoteNumber: string; customer: string; rep: string; status: string; daysInactive: number }
type Anomaly = { id: string; quoteNumber: string; customer: string; rep: string; riskScore: number; repAvg: number }
type Health = {
  stalledDays: number
  stalled: Stalled[]
  anomalies: Anomaly[]
  slippage: { id: string; quoteNumber: string; customer: string }[]
}

export default function DealHealth() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const health = useQuery({
    queryKey: ['deal-health'],
    queryFn: async () => (await api.get('/dashboard')).data as Health,
  })

  // both actions land in the audit trail against the quotation
  const alert = async (id: string, kind: 'nudge' | 'escalate') => {
    try {
      await api.post(`/dashboard/quotations/${id}/${kind}`)
      toast.success(kind === 'nudge' ? 'Nudge sent to the rep' : 'Escalated to the sales manager')
      qc.invalidateQueries({ queryKey: ['deal-health'] })
    } catch {
      toast.error(kind === 'nudge' ? 'Nudge failed' : 'Escalation failed')
    }
  }

  const h = health.data

  const stalledCols: Column<Stalled>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => (
        <Link to={`/quotations/${r.id}`} className="font-mono text-xs text-primary hover:underline">
          {r.quoteNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer' },
    { key: 'rep', label: 'Rep' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'daysInactive',
      label: 'Idle',
      align: 'right',
      render: (r) => <span className="text-amber-600">{r.daysInactive}d</span>,
    },
    {
      key: '__act',
      label: '',
      sortable: false,
      render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => nav(`/quotations/${r.id}`)}>
            Open
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              alert(r.id, 'nudge')
            }}
          >
            Nudge
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              alert(r.id, 'escalate')
            }}
          >
            Escalate
          </Button>
        </div>
      ),
    },
  ]

  const anomalyCols: Column<Anomaly>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => (
        <Link to={`/quotations/${r.id}`} className="font-mono text-xs text-primary hover:underline">
          {r.quoteNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer' },
    { key: 'rep', label: 'Rep' },
    {
      key: 'riskScore',
      label: 'Risk score',
      align: 'right',
      render: (r) => <span className="text-red-600 font-medium">{r.riskScore.toFixed(1)}</span>,
    },
    {
      key: 'repAvg',
      label: 'Rep avg',
      align: 'right',
      render: (r) => <span className="text-muted-foreground">{r.repAvg.toFixed(1)}</span>,
    },
  ]

  const card = 'rounded-lg border bg-background p-4'

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Deal Health' }]}>
      <div className="space-y-8">
        <section className={card}>
          <h2 className="font-semibold mb-3">
            Stalled deals{' '}
            <span className="text-muted-foreground text-sm font-normal">
              (&gt; {h?.stalledDays ?? '…'}d inactive)
            </span>
          </h2>
          <DataTable
            rows={h?.stalled ?? []}
            columns={stalledCols}
            loading={health.isLoading}
            pageSize={8}
            searchPlaceholder="Search customer or rep…"
            emptyMessage="No stalled deals."
          />
        </section>

        <section className={card}>
          <h2 className="font-semibold mb-3">Discount anomalies</h2>
          <DataTable
            rows={h?.anomalies ?? []}
            columns={anomalyCols}
            loading={health.isLoading}
            pageSize={8}
            onRowClick={(r) => nav(`/quotations/${r.id}`)}
            searchPlaceholder="Search customer or rep…"
            emptyMessage="No anomalies."
          />
        </section>

        <section className={card}>
          <h2 className="font-semibold mb-2">Delivery slippage (backorders)</h2>
          {(h?.slippage.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">No backordered deliveries.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {h!.slippage.map((s) => (
                <li key={s.id} className="flex justify-between border-b py-1">
                  <span>
                    <Link
                      to={`/quotations/${s.id}`}
                      className="font-mono text-xs text-primary hover:underline mr-2"
                    >
                      {s.quoteNumber}
                    </Link>
                    {s.customer}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => nav(`/quotations/${s.id}/fulfillment`)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
