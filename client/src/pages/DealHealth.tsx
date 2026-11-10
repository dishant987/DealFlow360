import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

  const card = 'rounded-xl border bg-background p-5'

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Deal Health' }]}>
      {/* one list at a time: tabs instead of three long tables stacked on one page */}
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Deal health</h1>
          <p className="text-sm text-muted-foreground">Deals that need a push, discounts out of line, and deliveries running late.</p>
        </div>
        <Tabs defaultValue="stalled">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="stalled">Stalled · {h?.stalled.length ?? '…'}</TabsTrigger>
            <TabsTrigger value="anomalies">Discount anomalies · {h?.anomalies.length ?? '…'}</TabsTrigger>
            <TabsTrigger value="slippage">Delivery slippage · {h?.slippage.length ?? '…'}</TabsTrigger>
          </TabsList>

          <TabsContent value="stalled" className={card}>
            <p className="mb-3 text-sm text-muted-foreground">No activity for more than {h?.stalledDays ?? '…'} days. Nudge the rep or escalate to their manager.</p>
            <DataTable
              rows={h?.stalled ?? []}
              columns={stalledCols}
              loading={health.isLoading}
              pageSize={10}
              searchPlaceholder="Search customer or rep…"
              emptyMessage="No stalled deals."
            />
          </TabsContent>

          <TabsContent value="anomalies" className={card}>
            <p className="mb-3 text-sm text-muted-foreground">Quotes whose discount risk is well above the rep's own average.</p>
            <DataTable
              rows={h?.anomalies ?? []}
              columns={anomalyCols}
              loading={health.isLoading}
              pageSize={10}
              onRowClick={(r) => nav(`/quotations/${r.id}`)}
              searchPlaceholder="Search customer or rep…"
              emptyMessage="No anomalies."
            />
          </TabsContent>

          <TabsContent value="slippage" className={card}>
            <p className="mb-3 text-sm text-muted-foreground">Orders with items on backorder.</p>
            {(h?.slippage.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No backordered deliveries.</p>
            ) : (
              <ul className="divide-y text-sm">
                {h!.slippage.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <Link to={`/quotations/${x.id}`} className="mr-2 font-mono text-xs text-primary hover:underline">
                        {x.quoteNumber}
                      </Link>
                      {x.customer}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => nav(`/quotations/${x.id}/fulfillment`)}>
                      Open fulfilment
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
