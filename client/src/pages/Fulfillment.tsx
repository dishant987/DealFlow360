import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import PageSkeleton from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Option = { warehouseId: string; warehouse: string; available: number; weight: number; suggested: number }
type SugLine = { lineId: string; product: string; needed: number; options: Option[]; backordered: number }
type Suggestion = {
  status: string
  lines: SugLine[]
  shipmentCount: number
  estimatedShippingCost: number
  consolidatable: number
}
type Alloc = {
  id: string
  product: string
  warehouse: string | null
  quantity: number
  backordered: boolean
}

export default function Fulfillment() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canAct = !!user && ['finance', 'admin'].includes(user.role)
  const qc = useQueryClient()
  // qty[lineId][warehouseId]
  const [qty, setQty] = useState<Record<string, Record<string, number>>>({})
  const [busy, setBusy] = useState(false)

  const suggestion = useQuery({
    queryKey: ['fulfillment', id],
    queryFn: async () => (await api.get(`/quotations/${id}/fulfillment/suggestion`)).data as Suggestion,
  })
  const allocations = useQuery({
    queryKey: ['allocations', id],
    queryFn: async () => (await api.get(`/quotations/${id}/fulfillment/allocations`)).data as Alloc[],
  })

  useEffect(() => {
    if (suggestion.data) {
      const seed: Record<string, Record<string, number>> = {}
      for (const l of suggestion.data.lines) {
        seed[l.lineId] = {}
        for (const o of l.options) seed[l.lineId][o.warehouseId] = o.suggested
      }
      setQty(seed)
    }
  }, [suggestion.data])

  const setQ = (lineId: string, whId: string, v: number) =>
    setQty((s) => ({ ...s, [lineId]: { ...s[lineId], [whId]: v } }))

  const lineAllocated = (l: SugLine) =>
    l.options.reduce((sum, o) => sum + (qty[l.lineId]?.[o.warehouseId] ?? 0), 0)

  const distinctWarehouses = new Set<string>()
  for (const l of suggestion.data?.lines ?? [])
    for (const o of l.options) if ((qty[l.lineId]?.[o.warehouseId] ?? 0) > 0) distinctWarehouses.add(o.warehouseId)

  const accept = async () => {
    const body = {
      allocations: (suggestion.data?.lines ?? []).flatMap((l) =>
        l.options
          .filter((o) => (qty[l.lineId]?.[o.warehouseId] ?? 0) > 0)
          .map((o) => ({ lineId: l.lineId, warehouseId: o.warehouseId, quantity: qty[l.lineId][o.warehouseId] })),
      ),
    }
    setBusy(true)
    try {
      await api.post(`/quotations/${id}/fulfillment/accept`, body)
      toast.success('Fulfillment saved — stock decremented')
      qc.invalidateQueries({ queryKey: ['allocations', id] })
      qc.invalidateQueries({ queryKey: ['fulfillment', id] })
    } catch (e: any) {
      toast.error(errText(e, 'Accept failed'))
    } finally {
      setBusy(false)
    }
  }

  const consolidate = async () => {
    setBusy(true)
    try {
      await api.post(`/quotations/${id}/fulfillment/consolidate`)
      toast.success('Backorder consolidated from available stock')
      qc.invalidateQueries({ queryKey: ['allocations', id] })
      qc.invalidateQueries({ queryKey: ['fulfillment', id] })
    } catch {
      toast.error('Consolidate failed')
    } finally {
      setBusy(false)
    }
  }

  if (suggestion.isLoading)
    return (
      <AppShell
        crumbs={[
          { label: 'Workspace', to: '/' },
          { label: 'Quotations', to: '/quotations' },
          { label: 'Fulfillment' },
        ]}
      >
        <PageSkeleton />
      </AppShell>
    )
  const s = suggestion.data
  const hasBackorder = (allocations.data ?? []).some((a) => a.backordered && a.quantity > 0)
  // a split already exists → this becomes the manual-override path, not a first accept
  const alreadyAccepted = (allocations.data ?? []).length > 0

  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: 'Quotations', to: '/quotations' },
        { label: 'Quote', to: `/quotations/${id}` },
        { label: 'Fulfillment' },
      ]}
    >
      {/* B6: stock has arrived since we backordered → prompt automatically */}
      {(s?.consolidatable ?? 0) > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Stock has arrived — <b>{s!.consolidatable}</b> backordered unit(s) can now be fulfilled.
          </p>
          {canAct && (
            <Button size="sm" onClick={consolidate} disabled={busy}>
              Consolidate Remaining Backorder
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="space-y-6">
          {s?.lines.length === 0 && (
            <p className="text-muted-foreground text-sm">No physical (stock-tracked) lines to fulfill.</p>
          )}
          {s?.lines.map((l) => {
            const allocated = lineAllocated(l)
            const backorder = Math.max(0, l.needed - allocated)
            return (
              <div key={l.lineId} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{l.product}</h3>
                  <span className="text-sm text-muted-foreground">need {l.needed}</span>
                </div>
                <div className="space-y-2">
                  {l.options.map((o) => (
                    <div key={o.warehouseId} className="flex items-center gap-3 text-sm">
                      <span className="w-40">{o.warehouse}</span>
                      <span className="text-muted-foreground w-24">avail {o.available}</span>
                      <Input
                        type="number"
                        className="w-24"
                        min={0}
                        max={o.available}
                        value={qty[l.lineId]?.[o.warehouseId] ?? 0}
                        onChange={(e) =>
                          setQ(l.lineId, o.warehouseId, Math.max(0, Math.min(o.available, Number(e.target.value))))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-sm">
                  Allocated {allocated}/{l.needed}
                  {backorder > 0 && <span className="text-amber-600"> · {backorder} backordered</span>}
                </div>
              </div>
            )
          })}
        </section>

        <aside className="space-y-3 rounded-lg border p-4 h-fit">
          <h2 className="font-semibold">Plan</h2>
          <div className="flex justify-between text-sm">
            <span>Shipments</span>
            <span>{distinctWarehouses.size}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Est. shipping</span>
            <span>{s?.estimatedShippingCost.toFixed(2)}</span>
          </div>
          {canAct ? (
            <>
              {alreadyAccepted && (
                <p className="text-xs rounded bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-1.5">
                  Split accepted — stock is allocated. Adjust the quantities above and update to
                  re-allocate.
                </p>
              )}
              <Button className="w-full" onClick={accept} disabled={busy || !s?.lines.length}>
                {alreadyAccepted ? 'Update Split' : 'Accept Split'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {alreadyAccepted
                  ? 'Re-allocating returns the current stock first, then applies the new split.'
                  : 'Edit the quantities above to manually override, then Accept.'}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              View only — fulfillment decisions are made by Finance/Operations.
            </p>
          )}

          {(allocations.data?.length ?? 0) > 0 && (
            <div className="border-t pt-3 space-y-1">
              <h3 className="text-sm font-medium">Saved allocations</h3>
              {allocations.data!.map((a) => (
                <div key={a.id} className="text-xs flex justify-between">
                  <span>
                    {a.product} — {a.backordered ? 'Backorder' : a.warehouse}
                  </span>
                  <span>{a.quantity}</span>
                </div>
              ))}
              {hasBackorder && canAct && (
                <Button
                  className="w-full mt-2"
                  size="sm"
                  variant="secondary"
                  onClick={consolidate}
                  disabled={busy}
                >
                  Consolidate Remaining Backorder
                </Button>
              )}
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  )
}
