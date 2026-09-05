import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

type Invoice = { id: string; type: string; status: string; amount: string; dueAt: string | null }
type Schedule = {
  id: string
  quoteLineId: string
  product: string
  plan: string
  interval: string
  nextBillingDate: string
  amount: string
  status: string
  quantity: number
}
type Credit = { id: string; amount: string; reason: string | null }
type Billing = { invoices: Invoice[]; schedules: Schedule[]; creditNotes: Credit[] }

export default function Billing() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [qtys, setQtys] = useState<Record<string, number>>({})

  const billing = useQuery({
    queryKey: ['billing', id],
    queryFn: async () => (await api.get(`/quotations/${id}/billing`)).data as Billing,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['billing', id] })
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Action failed')
    }
  }

  const b = billing.data
  const isEmpty = b && b.invoices.length === 0 && b.schedules.length === 0

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Billing · One-time & Recurring</span>
        <Button size="sm" variant="secondary" asChild>
          <Link to={`/quotations/${id}`}>Back to quote</Link>
        </Button>
      </header>

      <main className="p-6 space-y-8 max-w-4xl">
        <Button onClick={() => run(() => api.post(`/quotations/${id}/billing/generate`), 'Billing generated')}>
          {isEmpty ? 'Generate Billing' : 'Regenerate Billing'}
        </Button>

        {/* one-time invoices */}
        <section>
          <h2 className="font-semibold mb-2">One-time invoices</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(b?.invoices ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.type}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">${Number(inv.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    {inv.status !== 'paid' && (
                      <Button
                        size="sm"
                        onClick={() => run(() => api.post(`/invoices/${inv.id}/pay`), 'Payment recorded')}
                      >
                        Record payment
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {b?.invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-sm">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        {/* recurring subscriptions */}
        <section>
          <h2 className="font-semibold mb-2">Recurring subscriptions</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product / Plan</TableHead>
                <TableHead>Next billing</TableHead>
                <TableHead className="text-right">Per period</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(b?.schedules ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.product} <span className="text-muted-foreground">· {s.plan} ({s.interval})</span>
                    {s.status === 'cancelled' && (
                      <span className="ml-2 rounded bg-red-100 text-red-800 px-2 py-0.5 text-xs">
                        cancelled
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(s.nextBillingDate).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">${Number(s.amount).toFixed(2)}</TableCell>
                  <TableCell>{s.quantity}</TableCell>
                  <TableCell>
                    {s.status !== 'cancelled' && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="w-16"
                          min={1}
                          value={qtys[s.id] ?? s.quantity}
                          onChange={(e) => setQtys((q) => ({ ...q, [s.id]: Number(e.target.value) }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            run(
                              () =>
                                api.post(
                                  `/quotations/${id}/billing/subscriptions/${s.quoteLineId}/change`,
                                  { quantity: qtys[s.id] ?? s.quantity },
                                ),
                              'Subscription updated (prorated)',
                            )
                          }
                        >
                          Update
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            run(
                              () =>
                                api.post(
                                  `/quotations/${id}/billing/subscriptions/${s.quoteLineId}/cancel`,
                                ),
                              'Subscription cancelled',
                            )
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {b?.schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    No recurring lines.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        {/* credit notes */}
        {(b?.creditNotes.length ?? 0) > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Credit notes</h2>
            <ul className="text-sm space-y-1">
              {b!.creditNotes.map((c) => (
                <li key={c.id} className="flex justify-between border-b py-1">
                  <span>{c.reason}</span>
                  <span>${Number(c.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
