import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
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
  customer: string
  status: string
  orderDiscountPct: string
  lines: Line[]
  total: number
  subtotal: number
  negotiations: { id: string; type: string; message: string | null; counterDiscountPct: string | null; status: string }[]
}

export default function Portal() {
  const { token } = useParams<{ token: string }>()
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [counter, setCounter] = useState('')
  const [busy, setBusy] = useState(false)

  const quote = useQuery({
    queryKey: ['portal', token],
    queryFn: async () => (await api.get(`/portal/${token}`)).data as PortalQuote,
    retry: false,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['portal', token] })

  const submitRequest = async () => {
    if (!message && !counter) return toast.error('Add a comment or a counter discount')
    setBusy(true)
    try {
      await api.post(`/portal/${token}/negotiate`, {
        type: counter ? 'counter_discount' : 'comment',
        message: message || undefined,
        counterDiscountPct: counter || undefined,
      })
      toast.success('Request sent to the sales team')
      setMessage('')
      setCounter('')
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

  if (quote.isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>
  if (quote.isError || !quote.data)
    return <div className="p-8 text-destructive">This quotation link is invalid or expired.</div>

  const q = quote.data
  const confirmed = q.status === 'confirmed'

  return (
    <div className="min-h-svh bg-muted/30">
      {/* deliberately separate, minimal customer chrome — no internal nav */}
      <header className="bg-primary text-primary-foreground px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="font-semibold text-lg">DealFlow360</div>
          <div className="text-sm opacity-90">Your quotation · {q.customer}</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs uppercase">
            {q.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Disc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.product}
                    {l.lineType === 'subscription' && (
                      <span className="ml-1 text-xs text-muted-foreground">(subscription)</span>
                    )}
                  </TableCell>
                  <TableCell>{l.quantity}</TableCell>
                  <TableCell className="text-right">${Number(l.unitPrice).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{Number(l.discountPct).toFixed(0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-between border-t mt-3 pt-3 text-sm">
            <span>Order discount</span>
            <span>{Number(q.orderDiscountPct).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Total</span>
            <span>${q.total.toFixed(2)}</span>
          </div>
        </div>

        {!confirmed && (
          <div className="rounded-lg border bg-background p-4 space-y-3">
            <h2 className="font-semibold">Request a change or counter</h2>
            <textarea
              className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
              rows={3}
              placeholder="Comment or change request…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm">Counter order discount %</span>
              <Input
                type="number"
                className="w-24"
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={submitRequest} disabled={busy}>
                Submit Request
              </Button>
              <Button onClick={confirm} disabled={busy}>
                Confirm Quotation
              </Button>
            </div>
          </div>
        )}

        {q.negotiations.length > 0 && (
          <div className="rounded-lg border bg-background p-4">
            <h3 className="font-medium text-sm mb-2">Your requests</h3>
            <ul className="text-sm space-y-1">
              {q.negotiations.map((n) => (
                <li key={n.id} className="flex justify-between border-b py-1">
                  <span>
                    {n.type.replace(/_/g, ' ')}
                    {n.message ? `: ${n.message}` : ''}
                    {n.counterDiscountPct ? ` (${Number(n.counterDiscountPct).toFixed(0)}%)` : ''}
                  </span>
                  <span className="text-muted-foreground">{n.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
