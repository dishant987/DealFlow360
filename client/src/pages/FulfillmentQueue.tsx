import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import StatCard from '@/components/StatCard'
import Panel from '@/components/Panel'

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
type StockRow = {
  warehouseId: string
  warehouse: string
  productId: string
  product: string
  inStock: number
  reserved: number
  available: number
  belowReorder: boolean
}
type Payload = { orders: Row[]; stock: StockRow[] }

const stateLabel: Record<Row['state'], string> = {
  awaiting: 'awaiting split',
  partial: 'backordered',
  complete: 'fulfilled',
}

export default function FulfillmentQueue() {
  const nav = useNavigate()
  const q = useQuery({
    queryKey: ['fulfillment-queue'],
    queryFn: async () => (await api.get('/fulfillment-queue')).data as Payload,
  })

  const rows = q.data?.orders ?? []
  const stock = q.data?.stock ?? []
  const counts = {
    awaiting: rows.filter((r) => r.state === 'awaiting').length,
    partial: rows.filter((r) => r.state === 'partial').length,
    complete: rows.filter((r) => r.state === 'complete').length,
  }

  const stockColumns: Column<StockRow>[] = [
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'product', label: 'Product' },
    { key: 'inStock', label: 'In Stock', align: 'right' },
    { key: 'reserved', label: 'Reserved', align: 'right' },
    {
      key: 'available',
      label: 'Available',
      align: 'right',
      render: (r) => (
        <span className={r.belowReorder ? 'text-amber-600 font-medium' : ''}>
          {r.available}
          {r.belowReorder && ' ⚠'}
        </span>
      ),
    },
  ]

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
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Awaiting split" value={counts.awaiting} loading={q.isLoading} />
          <StatCard
            label="With backorder"
            value={counts.partial}
            tone={counts.partial > 0 ? 'warning' : 'default'}
            loading={q.isLoading}
          />
          <StatCard
            label="Fulfilled"
            value={counts.complete}
            tone="success"
            loading={q.isLoading}
          />
        </div>

        <Panel
          title="Stock by warehouse"
          description="Available is what the split logic can draw on right now; reserved is already committed to a fulfilled deal. ⚠ marks a line at or below its reorder level."
        >
          <DataTable
            rows={stock}
            columns={stockColumns}
            loading={q.isLoading}
            searchPlaceholder="Search warehouse or product…"
            emptyMessage="No stock records yet — add them in Config → Stock."
          />
        </Panel>

        <Panel title="Orders awaiting fulfillment">
          <DataTable
            rows={rows}
            columns={columns}
            loading={q.isLoading}
            onRowClick={(r) => nav(`/quotations/${r.id}/fulfillment`)}
            searchPlaceholder="Search quote # or customer…"
            emptyMessage="Nothing approved is waiting on fulfillment."
          />
        </Panel>
      </div>
    </AppShell>
  )
}
