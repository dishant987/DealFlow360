import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'

type Row = {
  id: string
  quoteNumber: string
  customer: string
  status: string
  updatedAt: string
  allocated: number
  backordered: number
  shipments: number
  state: 'awaiting' | 'partial' | 'complete'
}

const stateLabel: Record<Row['state'], string> = {
  awaiting: 'awaiting split',
  partial: 'backordered',
  complete: 'fulfilled',
}

export default function FulfillmentQueue() {
  const nav = useNavigate()
  const q = useQuery({
    queryKey: ['fulfillment-queue'],
    queryFn: async () => (await api.get('/fulfillment-queue')).data as Row[],
  })

  const rows = q.data ?? []
  const counts = {
    awaiting: rows.filter((r) => r.state === 'awaiting').length,
    partial: rows.filter((r) => r.state === 'partial').length,
    complete: rows.filter((r) => r.state === 'complete').length,
  }

  const columns: Column<Row>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => (
        <Link
          to={`/quotations/${r.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-primary hover:underline"
        >
          {r.quoteNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Deal status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'state',
      label: 'Fulfillment',
      render: (r) => <StatusBadge status={r.state} label={stateLabel[r.state]} />,
    },
    { key: 'allocated', label: 'Allocated', align: 'right' },
    {
      key: 'backordered',
      label: 'Backordered',
      align: 'right',
      render: (r) =>
        r.backordered > 0 ? (
          <span className="text-amber-600 font-medium">{r.backordered}</span>
        ) : (
          '0'
        ),
    },
    { key: 'shipments', label: 'Shipments', align: 'right' },
  ]

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Fulfillment' }]}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Awaiting split', value: counts.awaiting },
            { label: 'With backorder', value: counts.partial },
            { label: 'Fulfilled', value: counts.complete },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border bg-background p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold">{k.value}</div>
            </div>
          ))}
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          loading={q.isLoading}
          onRowClick={(r) => nav(`/quotations/${r.id}/fulfillment`)}
          searchPlaceholder="Search quote # or customer…"
          emptyMessage="Nothing approved is waiting on fulfillment."
        />
      </div>
    </AppShell>
  )
}
