import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import PageSkeleton from '@/components/PageSkeleton'
import { lineMargin, quoteTotals } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Product = {
  id: string
  name: string
  type: string
  unitPrice: string
  unitCost: string
  isPromoted: boolean
}
type Line = {
  id: string
  productId: string
  product: string
  quantity: number
  unitPrice: string
  unitCost: string
  discountPct: string
  lineType: string
}
type Upsell = {
  productId: string
  name: string
  unitPrice: string
  unitCost: string
  marginPct: number
  isPromoted: boolean
  reason: string
}
type Risk = {
  score: number
  level: 'none' | 'manager' | 'finance'
  requiresManager: boolean
  requiresFinance: boolean
  breaches: { index: number; discountPct: number; ceiling: number; overBy: number }[]
}
type Quote = {
  id: string
  customer: string
  customerTier: string
  status: string
  orderDiscountPct: string
  lines: Line[]
  risk: Risk | null
}

const marginColor = (pct: number) =>
  pct >= 20 ? 'text-emerald-600' : pct >= 10 ? 'text-amber-600' : 'text-red-600'

export default function QuotationBuilder() {
  const { id } = useParams<{ id: string }>()
  const [lines, setLines] = useState<Line[]>([])
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [pick, setPick] = useState('')
  const [risk, setRisk] = useState<Risk | null>(null)
  const [status, setStatus] = useState('draft')
  const [submitting, setSubmitting] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')

  const quote = useQuery({
    queryKey: ['quotation', id],
    queryFn: async () => (await api.get(`/quotations/${id}`)).data as Quote,
  })
  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data as Product[],
  })
  const upsell = useQuery({
    queryKey: ['upsell', id],
    queryFn: async () => (await api.get(`/quotations/${id}/upsell`)).data as Upsell[],
  })
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Seed the editable cart ONCE — live refetches (socket updates) must never
  // clobber in-progress edits. Status/risk stay live so approvals show up instantly.
  const seeded = useRef(false)
  useEffect(() => {
    if (!quote.data) return
    if (!seeded.current) {
      seeded.current = true
      setLines(quote.data.lines)
      setOrderDiscount(String(quote.data.orderDiscountPct))
    }
    setRisk(quote.data.risk)
    setStatus(quote.data.status)
  }, [quote.data])

  const submit = async () => {
    setSubmitting(true)
    try {
      const { data } = await api.post(`/quotations/${id}/submit`)
      setRisk(data.risk)
      setStatus(data.quotation.status)
      toast.success(
        data.risk.level === 'none'
          ? 'No approval needed — approved for fulfillment'
          : `Routed for approval: ${data.risk.requiresFinance ? 'Manager → Finance' : 'Manager'}`,
      )
    } catch {
      toast.error('Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const totals = quoteTotals(lines, orderDiscount)

  // true impact on the ORDER margin if this suggestion were added (percentage points)
  const marginDelta = (s: Upsell) => {
    const next = quoteTotals(
      [...lines, { quantity: 1, unitPrice: s.unitPrice, unitCost: s.unitCost, discountPct: 0 }],
      orderDiscount,
    )
    return Math.round((next.marginPct - totals.marginPct) * 10) / 10
  }

  const addLine = async () => {
    if (!pick) return
    try {
      const { data } = await api.post(`/quotations/${id}/lines`, { productId: pick })
      const prod = products.data?.find((p) => p.id === pick)
      setLines((ls) => [...ls, { ...data, product: prod?.name ?? '' }])
      setPick('')
      upsell.refetch()
    } catch {
      toast.error('Could not add product')
    }
  }

  const addUpsell = async (s: Upsell) => {
    try {
      const { data } = await api.post(`/quotations/${id}/lines`, { productId: s.productId })
      setLines((ls) => [...ls, { ...data, product: s.name }])
      toast.success(`Added ${s.name}`)
      upsell.refetch()
    } catch {
      toast.error('Could not add suggestion')
    }
  }

  const setLine = (lineId: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))

  const persistLine = async (lineId: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/quotations/${id}/lines/${lineId}`, body)
    } catch {
      toast.error('Failed to save change')
    }
  }

  const changeQty = (line: Line, delta: number) => {
    const quantity = Math.max(1, line.quantity + delta)
    setLine(line.id, { quantity })
    persistLine(line.id, { quantity })
  }

  const removeLine = async (lineId: string) => {
    setLines((ls) => ls.filter((l) => l.id !== lineId))
    try {
      await api.delete(`/quotations/${id}/lines/${lineId}`)
      upsell.refetch()
    } catch {
      toast.error('Failed to remove line')
    }
  }

  const sendToCustomer = async () => {
    try {
      const { data } = await api.post(`/quotations/${id}/send`)
      setPortalUrl(data.portalUrl)
      setStatus('sent')
      toast.success('Portal link generated')
    } catch {
      toast.error('Could not generate portal link')
    }
  }

  const persistOrderDiscount = async (v: string) => {
    try {
      await api.patch(`/quotations/${id}`, { orderDiscountPct: v })
    } catch {
      toast.error('Failed to save order discount')
    }
  }

  if (quote.isLoading)
    return (
      <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Quotations', to: '/quotations' }, { label: 'Loading…' }]}>
        <PageSkeleton />
      </AppShell>
    )
  if (!quote.data) return <div className="p-8 text-destructive">Quotation not found.</div>

  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: 'Quotations', to: '/quotations' },
        { label: `${quote.data.customer} (${quote.data.customerTier})` },
      ]}
      actions={
        <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs uppercase">
          {status.replace(/_/g, ' ')}
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* cart */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm min-w-64"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Add product…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ${Number(p.unitPrice).toFixed(2)} {p.isPromoted ? '★' : ''}
                </option>
              ))}
            </select>
            <Button onClick={addLine} disabled={!pick}>
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-28">Qty</TableHead>
                <TableHead className="w-24">Disc %</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const m = lineMargin(l)
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.product}
                      {l.lineType === 'subscription' && (
                        <span className="ml-1 rounded bg-primary/10 text-primary px-1 text-xs">
                          sub
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => changeQty(l, -1)}>
                          −
                        </Button>
                        <span className="w-6 text-center">{l.quantity}</span>
                        <Button size="sm" variant="outline" onClick={() => changeQty(l, 1)}>
                          +
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-20"
                        value={l.discountPct}
                        onChange={(e) => setLine(l.id, { discountPct: e.target.value })}
                        onBlur={(e) => persistLine(l.id, { discountPct: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-right">${m.net.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${marginColor(m.marginPct)}`}>
                      {m.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => removeLine(l.id)}>
                        ✕
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm">
                    No lines yet — add a product above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <aside className="space-y-4 h-fit">
        {/* upsell / cross-sell */}
        {(upsell.data ?? []).filter((s) => !dismissed.has(s.productId)).length > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold">Suggested add-ons</h2>
            {(upsell.data ?? [])
              .filter((s) => !dismissed.has(s.productId))
              .map((s) => (
                <div key={s.productId} className="rounded border p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    {s.isPromoted && (
                      <span className="rounded bg-primary/10 text-primary px-1.5 text-[10px]">
                        Promoted
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.reason}</div>
                  <div className="text-xs">
                    ${Number(s.unitPrice).toFixed(2)} ·{' '}
                    <span className={marginColor(s.marginPct)}>{s.marginPct}% margin</span>
                  </div>
                  {(() => {
                    const d = marginDelta(s)
                    return (
                      <div className="text-xs">
                        Order margin{' '}
                        <span className={d >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {d >= 0 ? '+' : ''}
                          {d.toFixed(1)} pts
                        </span>{' '}
                        if added
                      </div>
                    )
                  })()}
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => addUpsell(s)}>
                      Add to Quote
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDismissed((d) => new Set(d).add(s.productId))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* live summary */}
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Summary</h2>
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Order discount %</span>
            <Input
              type="number"
              className="w-20"
              value={orderDiscount}
              onChange={(e) => setOrderDiscount(e.target.value)}
              onBlur={(e) => persistOrderDiscount(e.target.value)}
            />
          </div>
          <div className="flex justify-between font-medium border-t pt-2">
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Cost</span>
            <span>${totals.cost.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between font-semibold ${marginColor(totals.marginPct)}`}>
            <span>Margin</span>
            <span>
              ${totals.marginAmount.toFixed(2)} ({totals.marginPct.toFixed(1)}%)
            </span>
          </div>

          {/* discount risk + submit */}
          <div className="border-t pt-3 space-y-2">
            {risk && (
              <>
                <div className="flex justify-between text-sm">
                  <span>Discount risk score</span>
                  <span className="font-medium">{risk.score.toFixed(1)}</span>
                </div>
                {risk.level === 'none' ? (
                  <p className="text-xs text-emerald-600">Within limits — no approval needed.</p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Needs {risk.requiresFinance ? 'Manager → Finance' : 'Manager'} approval
                    {risk.breaches.length > 0 &&
                      ` · ${risk.breaches.length} line(s) over ceiling`}
                  </p>
                )}
              </>
            )}
            <Button className="w-full" onClick={submit} disabled={submitting || lines.length === 0}>
              {submitting ? 'Submitting…' : 'Submit / Confirm'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Re-evaluates discounts and auto-routes for approval if over limits.
            </p>
            {(status === 'approved' || status === 'fulfilled') && (
              <Button className="w-full" variant="secondary" asChild>
                <Link to={`/quotations/${id}/fulfillment`}>Go to Fulfillment</Link>
              </Button>
            )}
            {(status === 'fulfilled' || status === 'invoiced' || status === 'approved') && (
              <Button className="w-full" variant="secondary" asChild>
                <Link to={`/quotations/${id}/billing`}>Go to Billing</Link>
              </Button>
            )}
            <Button className="w-full" variant="outline" onClick={sendToCustomer}>
              Send to Customer
            </Button>
            {portalUrl && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Customer portal link:</p>
                <Input readOnly value={portalUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
          </div>
        </div>
        </aside>
      </div>
    </AppShell>
  )
}
