import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import StatCard from '@/components/StatCard'

type Sub = {
  id: string
  quotationId: string
  quoteNumber: string
  customer: string
  product: string
  plan: string
  interval: string
  quantity: number
  amount: string
  nextBillingDate: string
  status: string
  dueSoon: boolean
}
type Payload = {
  subscriptions: Sub[]
  summary: { active: number; paused: number; cancelled: number; mrr: number }
}

export default function Subscriptions() {
  const nav = useNavigate()
  const q = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.get('/subscriptions')).data as Payload,
  })

  const columns: Column<Sub>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => (
        <Link
          to={`/quotations/${r.quotationId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-primary hover:underline"
        >
          {r.quoteNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer' },
    {
      key: 'product',
      label: 'Product / Plan',
      render: (r) => (
        <span>
          {r.product} <span className="text-muted-foreground">· {r.plan} ({r.interval})</span>
        </span>
      ),
    },
    { key: 'quantity', label: 'Qty', align: 'right' },
    {
      key: 'amount',
      label: 'Per period',
      align: 'right',
      value: (r) => Number(r.amount),
      render: (r) => `$${Number(r.amount).toFixed(2)}`,
    },
    {
      key: 'nextBillingDate',
      label: 'Next billing',
      value: (r) => new Date(r.nextBillingDate).getTime(),
      render: (r) => (
        <span className={r.dueSoon ? 'text-amber-600 font-medium' : ''}>
          {new Date(r.nextBillingDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ]

  const s = q.data?.summary

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Subscriptions' }]}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active" value={s?.active ?? 0} tone="success" loading={q.isLoading} />
          <StatCard
            label="Paused"
            value={s?.paused ?? 0}
            hint="billing suspended"
            tone={(s?.paused ?? 0) > 0 ? 'warning' : 'default'}
            loading={q.isLoading}
          />
          <StatCard label="Cancelled" value={s?.cancelled ?? 0} loading={q.isLoading} />
          <StatCard
            label="MRR"
            value={`$${(s?.mrr ?? 0).toFixed(2)}`}
            hint="normalised monthly, active plans only"
            tone="primary"
            loading={q.isLoading}
          />
        </div>

        <DataTable
          rows={q.data?.subscriptions ?? []}
          columns={columns}
          loading={q.isLoading}
          onRowClick={(r) => nav(`/quotations/${r.quotationId}/billing`)}
          searchPlaceholder="Search quote #, customer, product or plan…"
          emptyMessage="No subscriptions yet."
        />
      </div>
    </AppShell>
  )
}
