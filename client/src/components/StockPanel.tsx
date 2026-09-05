import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

type Detail = {
  product: { id: string; name: string; sku: string }
  warehouses: {
    warehouseId: string
    warehouse: string
    quantity: number
    reorderLevel: number
    allocated: number
    belowReorder: boolean
  }[]
  totals: { onHand: number; allocated: number; backordered: number }
  history: {
    id: string
    createdAt: string
    quantity: number
    backordered: boolean
    warehouse: string
    customer: string
    status: string
    quotationId: string
    quoteNumber: string
  }[]
}

export default function StockPanel({
  productId,
  onClose,
}: {
  productId: string | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['/config/products', productId, 'stock'],
    queryFn: async () => (await api.get(`/config/products/${productId}/stock`)).data as Detail,
    enabled: !!productId,
  })

  const d = detail.data

  return (
    <Sheet open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-4xl overflow-y-auto p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">{d?.product.name ?? 'Stock'}</SheetTitle>
          <SheetDescription>
            {d ? (
              <span className="font-mono text-xs">{d.product.sku}</span>
            ) : (
              'Loading…'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 space-y-8">
          {detail.isLoading && <Skeleton className="h-64 w-full" />}

          {d && (
            <>
              {/* totals */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'On hand', value: d.totals.onHand, tone: 'text-foreground' },
                  { label: 'Allocated', value: d.totals.allocated, tone: 'text-sky-700' },
                  { label: 'Backordered', value: d.totals.backordered, tone: 'text-amber-700' },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t.label}
                    </div>
                    <div className={`text-2xl font-semibold mt-0.5 ${t.tone}`}>{t.value}</div>
                  </div>
                ))}
              </div>

              {/* per warehouse */}
              <section>
                <h3 className="font-semibold text-sm mb-2">By warehouse</h3>
                {d.warehouses.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded border bg-muted/30 px-4 py-3">
                    Not a stocked product — fulfillment skips it.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Reorder at</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.warehouses.map((w) => (
                        <TableRow key={w.warehouseId}>
                          <TableCell className="font-medium">{w.warehouse}</TableCell>
                          <TableCell className="text-right font-medium">{w.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {w.allocated}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {w.reorderLevel}
                          </TableCell>
                          <TableCell>
                            {w.belowReorder && (
                              <span className="rounded bg-red-100 text-red-800 px-2 py-0.5 text-xs whitespace-nowrap">
                                restock
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              {/* movement history */}
              <section>
                <h3 className="font-semibold text-sm mb-2">
                  Movement history{' '}
                  <span className="text-muted-foreground font-normal">
                    ({d.history.length})
                  </span>
                </h3>
                {d.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded border bg-muted/30 px-4 py-3">
                    No stock has been allocated for this product yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Quote</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleDateString()}{' '}
                            {new Date(h.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/quotations/${h.quotationId}`}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {h.quoteNumber}
                            </Link>
                            <div className="mt-0.5">
                              <StatusBadge status={h.status} className="text-[10px] px-1.5 py-0" />
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{h.customer}</TableCell>
                          <TableCell>
                            <span
                              className={`rounded px-2 py-0.5 text-xs whitespace-nowrap ${
                                h.backordered
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {h.backordered ? 'backordered' : h.warehouse}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            −{h.quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
