import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { errText } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import StatCard from '@/components/StatCard'
import Panel from '@/components/Panel'
import { Select } from '@/components/ui/select'

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
type Proposal = {
  stockId: string
  warehouse: string
  product: string
  available: number
  reorderLevel: number
  targetLevel: number
  suggested: number
  urgent: boolean
}
type Payload = { orders: Row[]; stock: StockRow[]; replenishment: Proposal[] }

const stateLabel: Record<Row['state'], string> = {
  awaiting: 'awaiting split',
  partial: 'backordered',
  complete: 'fulfilled',
}

export default function FulfillmentQueue() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['fulfillment-queue'],
    queryFn: async () => (await api.get('/fulfillment-queue')).data as Payload,
  })

  const rows = q.data?.orders ?? []
  const stock = q.data?.stock ?? []
  const proposals = q.data?.replenishment ?? []
  const { user } = useAuth()
  const canAct = !!user && ['finance', 'admin'].includes(user.role)

  // Orders table filters
  const [state, setState] = useState('')
  const [dealStatus, setDealStatus] = useState('')
  const [orderCustomer, setOrderCustomer] = useState('')
  // Stock table filters
  const [warehouse, setWarehouse] = useState('')
  const [product, setProduct] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  // Every option list is derived from the rows on screen, so it can never offer
  // a warehouse or a status that isn't actually in the data.
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))
  const dealStatuses = useMemo(() => uniq(rows.map((r) => r.status)), [rows])
  const orderCustomers = useMemo(() => uniq(rows.map((r) => r.customer)), [rows])
  const warehouses = useMemo(() => uniq(stock.map((r) => r.warehouse)), [stock])
  const products = useMemo(() => uniq(stock.map((r) => r.product)), [stock])

  const visibleOrders = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!state || r.state === state) &&
          (!dealStatus || r.status === dealStatus) &&
          (!orderCustomer || r.customer === orderCustomer),
      ),
    [rows, state, dealStatus, orderCustomer],
  )
  const visibleStock = useMemo(
    () =>
      stock.filter(
        (r) =>
          (!warehouse || r.warehouse === warehouse) &&
          (!product || r.product === product) &&
          (!lowOnly || r.belowReorder),
      ),
    [stock, warehouse, product, lowOnly],
  )

  const orderFilters = (state ? 1 : 0) + (dealStatus ? 1 : 0) + (orderCustomer ? 1 : 0)
  const stockFilters = (warehouse ? 1 : 0) + (product ? 1 : 0) + (lowOnly ? 1 : 0)

  const receive = useMutation({
    mutationFn: async (stockId: string) =>
      (await api.post(`/stock/${stockId}/receive`)).data as {
        product: string
        warehouse: string
        received: number
        onHand: number
      },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['fulfillment-queue'] })
      toast.success(`Received ${d.received} × ${d.product} into ${d.warehouse} — now ${d.onHand} on hand`)
    },
    onError: (e) => toast.error(errText(e, 'Could not receive stock')),
  })
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

        {proposals.length > 0 && (
          <Panel
            title="Replenishment needed"
            description="Locations at or below their reorder point, with the quantity that would bring each back up to its target."
          >
            <ul className="divide-y">
              {proposals.map((p) => (
                <li key={p.stockId} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {p.product}{' '}
                      <span className="font-normal text-muted-foreground">· {p.warehouse}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.available} available, reorders at {p.reorderLevel}, target {p.targetLevel}
                    </div>
                  </div>
                  {p.urgent && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                      out of stock
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-sm tabular-nums">
                      order <strong>{p.suggested}</strong>
                    </span>
                    {canAct && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={receive.isPending}
                        onClick={() => receive.mutate(p.stockId)}
                      >
                        <PackagePlus className="size-4" /> Receive
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel
          title="Stock by warehouse"
          description="Available is what the split logic can draw on right now; reserved is already committed to a fulfilled deal. ⚠ marks a line at or below its reorder level."
        >
          <DataTable
            rows={visibleStock}
            columns={stockColumns}
            loading={q.isLoading}
            searchPlaceholder="Search warehouse or product…"
            emptyMessage={
              stockFilters
                ? 'No stock line matches these filters.'
                : 'No stock records yet — add them in Config → Stock.'
            }
            toolbar={
              <>
                <Button
                  size="sm"
                  variant={lowOnly ? 'default' : 'outline'}
                  aria-pressed={lowOnly}
                  onClick={() => setLowOnly((v) => !v)}
                >
                  Below reorder only ({stock.filter((r) => r.belowReorder).length})
                </Button>
                <Select
                  aria-label="Filter stock by warehouse"
                  className="h-8 w-44 text-xs"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  <option value="">All warehouses</option>
                  {warehouses.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filter stock by product"
                  className="h-8 w-48 text-xs"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="">All products</option>
                  {products.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                {stockFilters > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setWarehouse('')
                      setProduct('')
                      setLowOnly(false)
                    }}
                  >
                    <X className="size-3.5" />
                    Clear {stockFilters}
                  </Button>
                )}
              </>
            }
          />
        </Panel>

        <Panel title="Orders awaiting fulfillment">
          <DataTable
            rows={visibleOrders}
            columns={columns}
            loading={q.isLoading}
            onRowClick={(r) => nav(`/quotations/${r.id}/fulfillment`)}
            searchPlaceholder="Search quote # or customer…"
            emptyMessage={
              orderFilters
                ? 'No order matches these filters.'
                : 'Nothing approved is waiting on fulfillment.'
            }
            toolbar={
              <>
                <Select
                  aria-label="Filter by fulfillment state"
                  className="h-8 w-44 text-xs"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  <option value="">All fulfillment states</option>
                  <option value="awaiting">Awaiting split ({counts.awaiting})</option>
                  <option value="partial">Backordered ({counts.partial})</option>
                  <option value="complete">Fulfilled ({counts.complete})</option>
                </Select>
                <Select
                  aria-label="Filter by deal status"
                  className="h-8 w-40 text-xs"
                  value={dealStatus}
                  onChange={(e) => setDealStatus(e.target.value)}
                >
                  <option value="">All deal statuses</option>
                  {dealStatuses.map((v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filter orders by customer"
                  className="h-8 w-44 text-xs"
                  value={orderCustomer}
                  onChange={(e) => setOrderCustomer(e.target.value)}
                >
                  <option value="">All customers</option>
                  {orderCustomers.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                {orderFilters > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setState('')
                      setDealStatus('')
                      setOrderCustomer('')
                    }}
                  >
                    <X className="size-3.5" />
                    Clear {orderFilters}
                  </Button>
                )}
              </>
            }
          />
        </Panel>
      </div>
    </AppShell>
  )
}
