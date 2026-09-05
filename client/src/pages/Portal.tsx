import { Fragment, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Lock, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
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

type Line = {
  id: string
  product: string
  quantity: number
  unitPrice: string
  discountPct: string
  lineType: string
}
type PortalQuote = {
  quoteNumber: string
  customer: string
  status: string
  orderDiscountPct: string
  lines: Line[]
  total: number
  subtotal: number
  negotiations: {
    id: string
    type: string
    message: string | null
    counterDiscountPct: string | null
    requestedDeliveryDate: string | null
    status: string
    quoteLineId: string | null
  }[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export default function Portal() {
  const { token } = useParams<{ token: string }>()
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [counter, setCounter] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [lineNote, setLineNote] = useState('')

  const quote = useQuery({
    queryKey: ['portal', token],
    queryFn: async () => (await api.get(`/portal/${token}`)).data as PortalQuote,
    retry: false,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['portal', token] })

  const submitRequest = async () => {
    if (!message && !counter && !deliveryDate)
      return toast.error('Add a comment, a counter discount or a requested delivery date')
    setBusy(true)
    try {
      await api.post(`/portal/${token}/negotiate`, {
        // a date-only ask with no counter is a change request, not a discount counter
        type: counter ? 'counter_discount' : deliveryDate && !message ? 'change_request' : 'comment',
        message: message || undefined,
        counterDiscountPct: counter || undefined,
        requestedDeliveryDate: deliveryDate || undefined,
      })
      toast.success('Request sent to the sales team')
      setMessage('')
      setCounter('')
      setDeliveryDate('')
      refresh()
    } catch {
      toast.error('Could not send request')
    } finally {
      setBusy(false)
    }
  }

  // B8: comment / request a change on a specific line
  const submitLineNote = async (lineId: string) => {
    if (!lineNote.trim()) return
    setBusy(true)
    try {
      await api.post(`/portal/${token}/negotiate`, {
        type: 'change_request',
        message: lineNote,
        quoteLineId: lineId,
      })
      toast.success('Request sent for this line')
      setLineNote('')
      setOpenLine(null)
      refresh()
    } catch {
      toast.error('Could not send request')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/portal/${token}/confirm`)
      toast.success(
        data.reEnteredApproval
          ? 'Confirmed — your requested terms need internal approval; we will follow up.'
          : 'Quotation confirmed. Thank you!',
      )
      refresh()
    } catch {
      toast.error('Could not confirm')
    } finally {
      setBusy(false)
    }
  }

  if (quote.isLoading)
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading your quotation…
      </div>
    )
  if (quote.isError || !quote.data)
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border bg-background p-6 text-center">
          <h1 className="font-heading text-lg font-medium">This link isn't valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been replaced by a newer quotation. Please contact your account
            manager for an up-to-date link.
          </p>
        </div>
      </div>
    )

  const q = quote.data
  const confirmed = q.status === 'confirmed'
  const orderDiscount = Number(q.orderDiscountPct)

  return (
    <div className="min-h-svh bg-muted/30">
      {/* deliberately separate, minimal customer chrome — no internal nav */}
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <div className="font-heading text-lg font-semibold">DealFlow360</div>
            <div className="text-sm text-primary-foreground/80">
              Quotation {q.quoteNumber} for {q.customer}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
            <Lock className="size-3.5" />
            Private link · no sign-in needed
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {confirmed && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">You've confirmed this quotation</p>
              <p className="text-sm text-emerald-800/80">
                Our team has been notified and will be in touch about next steps. No further action
                is needed from you.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_19rem] lg:items-start">
          <section className="space-y-6">
            <div className="rounded-xl border bg-background">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-heading font-medium">What's included</h2>
                <StatusBadge status={q.status} />
              </div>
              <div className="px-4 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-16 text-right">Qty</TableHead>
                      <TableHead className="w-24 text-right">Unit</TableHead>
                      <TableHead className="w-20 text-right">Disc</TableHead>
                      {!confirmed && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.lines.map((l) => (
                      <Fragment key={l.id}>
                        <TableRow>
                          <TableCell className="font-medium">
                            {l.product}
                            {l.lineType === 'subscription' && (
                              <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">
                                recurring
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{l.quantity}</TableCell>
                          <TableCell className="text-right">
                            ${Number(l.unitPrice).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(l.discountPct) > 0 ? (
                              <span className="text-emerald-600">
                                −{Number(l.discountPct).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {!confirmed && (
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => {
                                  setOpenLine(openLine === l.id ? null : l.id)
                                  setLineNote('')
                                }}
                              >
                                {openLine === l.id ? 'Cancel' : 'Comment'}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                        {openLine === l.id && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/40">
                              <div className="flex gap-2">
                                <Input
                                  autoFocus
                                  placeholder={`Question or change request for ${l.product}…`}
                                  value={lineNote}
                                  onChange={(e) => setLineNote(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && submitLineNote(l.id)}
                                />
                                <Button
                                  size="sm"
                                  disabled={busy || !lineNote.trim()}
                                  onClick={() => submitLineNote(l.id)}
                                >
                                  Send
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {!confirmed && (
              <div className="rounded-xl border bg-background p-4">
                <h2 className="font-heading font-medium">Not quite right?</h2>
                <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
                  Tell us what needs to change and we'll come back to you — nothing is agreed until
                  you confirm.
                </p>
                <textarea
                  className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  rows={3}
                  placeholder="Comment or change request…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label htmlFor="counter" className="text-xs text-muted-foreground">
                      Counter order discount %
                    </label>
                    <Input
                      id="counter"
                      type="number"
                      className="w-28"
                      value={counter}
                      onChange={(e) => setCounter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="delivery" className="text-xs text-muted-foreground">
                      Requested delivery date
                    </label>
                    <Input
                      id="delivery"
                      type="date"
                      className="w-44"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={submitRequest} disabled={busy}>
                    <MessageSquarePlus className="size-4" />
                    Submit request
                  </Button>
                </div>
              </div>
            )}

            {q.negotiations.length > 0 && (
              <div className="rounded-xl border bg-background p-4">
                <h2 className="font-heading font-medium">Your requests</h2>
                <ul className="mt-2 divide-y text-sm">
                  {q.negotiations.map((n) => {
                    const line = q.lines.find((l) => l.id === n.quoteLineId)
                    return (
                      <li key={n.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          {line && (
                            <span className="font-medium text-primary">{line.product}: </span>
                          )}
                          <span className="text-muted-foreground">
                            {n.message || n.type.replace(/_/g, ' ')}
                          </span>
                          {(n.counterDiscountPct || n.requestedDeliveryDate) && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {n.counterDiscountPct && (
                                <span>Counter: {Number(n.counterDiscountPct).toFixed(0)}%</span>
                              )}
                              {n.requestedDeliveryDate && (
                                <span>
                                  Delivery by{' '}
                                  {new Date(n.requestedDeliveryDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                            n.status === 'addressed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {n.status}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* summary + the one action that matters */}
          <aside className="rounded-xl border bg-background p-4 lg:sticky lg:top-6">
            <h2 className="font-heading font-medium">Summary</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{money(q.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Order discount</dt>
                <dd className={orderDiscount > 0 ? 'text-emerald-600' : ''}>
                  {orderDiscount > 0 ? `−${orderDiscount.toFixed(0)}%` : '—'}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(q.total)}</dd>
              </div>
            </dl>

            {!confirmed ? (
              <>
                <Button className="mt-4 w-full" onClick={confirm} disabled={busy}>
                  {busy ? 'Working…' : 'Confirm quotation'}
                </Button>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Confirming accepts these terms and hands the order to our fulfilment team. If
                  you've asked for a bigger discount, we'll review it internally first.
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Confirmed — thank you. Your account manager will follow up.
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
