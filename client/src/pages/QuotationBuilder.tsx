import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, MessageSquare, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import PageSkeleton from '@/components/PageSkeleton'
import { lineMargin, quoteTotals } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import ConfirmButton from '@/components/ConfirmButton'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Variant = { id: string; attribute: string; value: string; extraPrice: string }
type Product = {
  id: string
  name: string
  category: string
  type: string
  unitPrice: string
  unitCost: string
  isPromoted: boolean
  variants: Variant[]
}
type Line = {
  id: string
  productId: string
  product: string
  variantAttribute?: string | null
  variantValue?: string | null
  quantity: number
  unitPrice: string
  unitCost: string
  discountPct: string
  lineType: string
  ceiling: number | null // min(tier, category) discount limit for this line
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
  thresholds: { managerThreshold: number; financeThreshold: number }
}
type Negotiation = {
  id: string
  type: 'comment' | 'change_request' | 'counter_discount'
  message: string | null
  counterDiscountPct: string | null
  requestedDeliveryDate: string | null
  status: 'open' | 'addressed'
  createdAt: string
  quoteLineId: string | null
  product: string | null
}
type Quote = {
  id: string
  quoteNumber: string
  customer: string
  customerTier: string
  status: string
  orderDiscountPct: string
  lines: Line[]
  risk: Risk | null
}

const marginColor = (pct: number) =>
  pct >= 20 ? 'text-emerald-600' : pct >= 10 ? 'text-amber-600' : 'text-red-600'

// Same rule the server scores on: the order discount stacks on top of the line
// discount, and the line is judged against its own ceiling. Recomputed on every
// keystroke so a breach shows the moment it is typed, not at submit.
const lineOverBy = (l: Line, orderDiscount: number | string) =>
  l.ceiling == null
    ? 0
    : Math.max(0, Math.round((Number(l.discountPct) + Number(orderDiscount) - l.ceiling) * 100) / 100)

export default function QuotationBuilder() {
  const { id } = useParams<{ id: string }>()
  const [lines, setLines] = useState<Line[]>([])
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [pick, setPick] = useState('')
  const [pickVariant, setPickVariant] = useState('')
  const [risk, setRisk] = useState<Risk | null>(null)
  const [status, setStatus] = useState('draft')
  const [submitting, setSubmitting] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')
  // everything persists as you edit — this just makes that visible
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const track = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaveState('saving')
    try {
      const out = await fn()
      setSaveState('saved')
      return out
    } catch (e) {
      setSaveState('error')
      throw e
    }
  }

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

  // B8 / §3: what the customer has asked for. The status note already tells the
  // rep to "review them before re-sending" — this is where they do that.
  const qc = useQueryClient()
  const negotiations = useQuery({
    queryKey: ['negotiations', id],
    queryFn: async () => (await api.get(`/quotations/${id}/negotiations`)).data as Negotiation[],
  })
  const resolve = useMutation({
    mutationFn: async (negotiationId: string) =>
      (await api.patch(`/quotations/${id}/negotiations/${negotiationId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['negotiations', id] })
      toast.success('Marked as addressed')
    },
    onError: (e) => toast.error(errText(e, 'Could not update the request')),
  })
  const requests = negotiations.data ?? []
  const openRequests = requests.filter((r) => r.status === 'open')

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
  const liveScore = Math.round(lines.reduce((s, l) => s + lineOverBy(l, orderDiscount), 0) * 100) / 100
  // a quote can only be (re)submitted while it is still the rep's to edit
  const canSubmit = status === 'draft' || status === 'rejected'
  // same rule as the server: the cart is only editable while it is the rep's
  const canEdit = canSubmit
  const canSend = ['approved', 'sent', 'under_negotiation', 'confirmed'].includes(status)
  const STATUS_NOTE: Record<string, string> = {
    pending_approval: 'Submitted — awaiting approval. You will be notified once a decision is made.',
    approved: 'Approved. Continue to fulfillment or billing below.',
    sent: 'Sent to the customer — awaiting their response in the portal.',
    under_negotiation: 'The customer has requested changes. Review them before re-sending.',
    confirmed: 'Confirmed by the customer. Continue to fulfillment or billing.',
    fulfilled: 'Fulfilled — stock has been allocated.',
    invoiced: 'Invoiced.',
    cancelled: 'This deal was cancelled.',
  }
  const pickedVariants = products.data?.find((p) => p.id === pick)?.variants ?? []

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
      const data = await track(async () => {
        const res = await api.post(`/quotations/${id}/lines`, {
          productId: pick,
          ...(pickVariant ? { variantId: pickVariant } : {}),
        })
        return res.data
      })
      const prod = products.data?.find((p) => p.id === pick)
      const v = prod?.variants?.find((x) => x.id === pickVariant)
      setLines((ls) => [
        ...ls,
        {
          ...data,
          product: prod?.name ?? '',
          variantAttribute: v?.attribute ?? null,
          variantValue: v?.value ?? null,
        },
      ])
      setPick('')
      setPickVariant('')
      upsell.refetch()
    } catch {
      toast.error('Could not add product')
    }
  }

  const addUpsell = async (s: Upsell) => {
    try {
      const { data } = await api.post(`/quotations/${id}/lines`, {
        productId: s.productId,
        viaUpsell: true,
      })
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
      await track(() => api.patch(`/quotations/${id}/lines/${lineId}`, body))
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
      await track(() => api.delete(`/quotations/${id}/lines/${lineId}`))
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
      await track(() => api.patch(`/quotations/${id}`, { orderDiscountPct: v }))
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
        { label: `${quote.data.quoteNumber} · ${quote.data.customer} (${quote.data.customerTier})` },
      ]}
      actions={
        <div className="flex items-center gap-3">
          {canEdit && saveState !== 'idle' && (
            <span
              className={`text-xs ${
                saveState === 'error'
                  ? 'text-destructive'
                  : saveState === 'saving'
                    ? 'text-muted-foreground'
                    : 'text-emerald-600'
              }`}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'error'
                  ? 'Not saved — retry your last change'
                  : '✓ All changes saved'}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* cart */}
        <section className="space-y-4">
          {/* B8: the customer's side of the conversation, and the rep's reply to it */}
          {requests.length > 0 && (
            <div className="rounded-xl border bg-background">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 className="font-heading font-medium">Customer requests</h2>
                  <p className="text-sm text-muted-foreground">
                    {openRequests.length > 0
                      ? `${openRequests.length} still open — address them before re-sending.`
                      : 'All requests have been addressed.'}
                  </p>
                </div>
                {openRequests.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {openRequests.length} open
                  </span>
                )}
              </header>
              <ul className="divide-y">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        {r.product && <span className="font-medium text-primary">{r.product}: </span>}
                        {r.message || <span className="text-muted-foreground">{r.type.replace(/_/g, ' ')}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.counterDiscountPct && (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                            <Percent className="size-3" />
                            counter {Number(r.counterDiscountPct).toFixed(0)}%
                          </span>
                        )}
                        {r.requestedDeliveryDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3" />
                            wants it by {new Date(r.requestedDeliveryDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {r.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate(r.id)}
                      >
                        Mark addressed
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <Check className="size-3.5" /> addressed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canEdit && (
          <div className="flex items-center gap-2">
            <Select
              className="min-w-64"
              value={pick}
              onChange={(e) => {
                setPick(e.target.value)
                setPickVariant('')
              }}
            >
              <option value="">Add product…</option>
              {/* B3: grouped by category (Hardware / Services / Subscriptions …) */}
              {Object.entries(
                (products.data ?? []).reduce<Record<string, Product[]>>((acc, p) => {
                  ;(acc[p.category ?? 'Other'] ??= []).push(p)
                  return acc
                }, {}),
              ).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${Number(p.unitPrice).toFixed(2)} {p.isPromoted ? '★' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {pickedVariants.length > 0 && (
              <Select
                value={pickVariant}
                onChange={(e) => setPickVariant(e.target.value)}
              >
                <option value="">{pickedVariants[0].attribute}…</option>
                {pickedVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.value}
                    {Number(v.extraPrice) > 0 ? ` (+$${Number(v.extraPrice).toFixed(2)})` : ''}
                  </option>
                ))}
              </Select>
            )}
            <Button onClick={addLine} disabled={!pick}>
              Add
            </Button>
          </div>
          )}
          {!canEdit && (
            <p className="text-xs rounded bg-muted px-2 py-1.5 text-muted-foreground">
              Locked — this quotation is {status.replace(/_/g, ' ')}. An approver must return it for
              revision before it can be edited.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-28">Qty</TableHead>
                <TableHead className="w-24">Disc %</TableHead>
                <TableHead className="w-16 text-right">Limit</TableHead>
                <TableHead className="w-24">Status</TableHead>
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
                      {l.variantValue && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({l.variantAttribute}: {l.variantValue})
                        </span>
                      )}
                      {l.lineType === 'subscription' && (
                        <span className="ml-1 rounded bg-primary/10 text-primary px-1 text-xs">
                          sub
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => changeQty(l, -1)}>
                          −
                        </Button>
                        <span className="w-6 text-center">{l.quantity}</span>
                        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => changeQty(l, 1)}>
                          +
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-20"
                        disabled={!canEdit}
                        value={l.discountPct}
                        onChange={(e) => setLine(l.id, { discountPct: e.target.value })}
                        onBlur={(e) => persistLine(l.id, { discountPct: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {l.ceiling == null ? '—' : `${l.ceiling}%`}
                    </TableCell>
                    <TableCell>
                      {l.ceiling == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : lineOverBy(l, orderDiscount) > 0 ? (
                        <span className="rounded bg-red-100 text-red-700 px-1.5 py-0.5 text-xs font-medium">
                          OVER (+{lineOverBy(l, orderDiscount)}pt)
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-xs font-medium">
                          OK
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">${m.net.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${marginColor(m.marginPct)}`}>
                      {m.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        disabled={!canEdit}
                        title={`Remove ${l.product} from this quotation?`}
                        description="The line and its discount will be removed."
                        confirmLabel="Remove"
                        onConfirm={() => removeLine(l.id)}
                      >
                        ✕
                      </ConfirmButton>
                    </TableCell>
                  </TableRow>
                )
              })}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-sm">
                    No lines yet — add a product above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <aside className="space-y-4 h-fit">
        {/* upsell / cross-sell */}
        {canEdit && (upsell.data ?? []).filter((s) => !dismissed.has(s.productId)).length > 0 && (
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
                    <Button size="sm" disabled={!canEdit} onClick={() => addUpsell(s)}>
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
              disabled={!canEdit}
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
                  <span className="font-medium">{liveScore.toFixed(1)}</span>
                </div>
                {(() => {
                  const overLines = lines.filter((l) => lineOverBy(l, orderDiscount) > 0).length
                  // Being over a ceiling is NOT the same as needing approval — the
                  // blended score still has to clear a threshold. That is the whole
                  // point of blending: one small overage stays under the bar, while
                  // several small ones add up and cross it.
                  const { managerThreshold, financeThreshold } = risk.thresholds
                  const route =
                    liveScore > financeThreshold
                      ? 'Manager → Finance'
                      : liveScore > managerThreshold
                        ? 'Manager'
                        : null

                  if (route)
                    return (
                      <p className="text-xs text-amber-600">
                        {overLines} line(s) over ceiling · routes for {route} approval on submit
                      </p>
                    )
                  if (overLines === 0)
                    return (
                      <p className="text-xs text-emerald-600">
                        Every line is within its limit — no approval needed.
                      </p>
                    )
                  return (
                    <p className="text-xs text-emerald-600">
                      {overLines} line(s) over ceiling, but the blended score is within the{' '}
                      {managerThreshold} approval threshold — no approval needed.
                    </p>
                  )
                })()}
              </>
            )}
            {canSubmit ? (
              <>
                <Button
                  className="w-full"
                  onClick={submit}
                  disabled={submitting || lines.length === 0}
                >
                  {submitting ? 'Submitting…' : 'Submit / Confirm'}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Re-evaluates discounts and auto-routes for approval if over limits.
                </p>
              </>
            ) : (
              <p className="text-xs rounded bg-muted px-2 py-1.5 text-muted-foreground">
                {STATUS_NOTE[status] ?? 'This quotation is no longer editable.'}
              </p>
            )}
            {(status === 'approved' || status === 'confirmed' || status === 'fulfilled') && (
              <Button className="w-full" variant="secondary" asChild>
                <Link to={`/quotations/${id}/fulfillment`}>Go to Fulfillment</Link>
              </Button>
            )}
            {(status === 'approved' || status === 'confirmed' || status === 'fulfilled' || status === 'invoiced') && (
              <Button className="w-full" variant="secondary" asChild>
                <Link to={`/quotations/${id}/billing`}>Go to Billing</Link>
              </Button>
            )}
            {canSend && (
              <Button className="w-full" variant="outline" onClick={sendToCustomer}>
                {status === 'sent' || status === 'under_negotiation'
                  ? 'Re-send to Customer'
                  : 'Send to Customer'}
              </Button>
            )}
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
