import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import ConfirmButton from '@/components/ConfirmButton'
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
  const { user } = useAuth()
  const canAct = !!user && ['finance', 'admin'].includes(user.role)
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
      toast.error(errText(e, 'Action failed'))
    }
  }

  const b = billing.data
  const isEmpty = b && (b.invoices?.length ?? 0) === 0 && (b.schedules?.length ?? 0) === 0
  // regenerating deletes invoices (payments cascade) — lock it once money is in
  const hasPayment = (b?.invoices ?? []).some((i) => i.status === 'paid')

  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: 'Quotations', to: '/quotations' },
        { label: 'Quote', to: `/quotations/${id}` },
        { label: 'Billing' },
      ]}
    >
      <div className="space-y-8 max-w-4xl">
        {canAct && hasPayment ? (
          <p className="text-sm rounded bg-muted px-3 py-2 text-muted-foreground">
            Billing is locked — a payment has been recorded against this quotation.
          </p>
        ) : canAct ? (
          <Button onClick={() => run(() => api.post(`/quotations/${id}/billing/generate`), 'Billing generated')}>
            {isEmpty ? 'Generate Billing' : 'Regenerate Billing'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            View only — billing is reconciled by Finance/Operations.
          </p>
        )}

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
                    {inv.status !== 'paid' && canAct && (
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
              {(b?.invoices?.length ?? 0) === 0 && (
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
                    {s.status !== 'cancelled' && canAct && (
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
                          variant="outline"
                          onClick={() =>
                            run(
                              () =>
                                api.post(
                                  `/quotations/${id}/billing/subscriptions/${s.quoteLineId}/${
                                    s.status === 'paused' ? 'resume' : 'pause'
                                  }`,
                                ),
                              s.status === 'paused'
                                ? 'Subscription resumed — next bill rolls forward a full period'
                                : 'Subscription paused — billing suspended',
                            )
                          }
                        >
                          {s.status === 'paused' ? 'Resume' : 'Pause'}
                        </Button>
                        <ConfirmButton
                          size="sm"
                          variant="destructive"
                          title={`Cancel the ${s.plan} subscription?`}
                          description="Billing stops and a prorated refund credit note is raised automatically."
                          confirmLabel="Cancel subscription"
                          onConfirm={() =>
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
                        </ConfirmButton>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(b?.schedules?.length ?? 0) === 0 && (
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
        {(b?.creditNotes?.length ?? 0) > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Credit notes</h2>
            <ul className="text-sm space-y-1">
              {(b?.creditNotes ?? []).map((c) => (
                <li key={c.id} className="flex justify-between border-b py-1">
                  <span>{c.reason}</span>
                  <span>${Number(c.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  )
}
