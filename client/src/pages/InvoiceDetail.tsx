import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, Eye, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { humanize, money } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import FormField from '@/components/FormField'
import PageSkeleton from '@/components/PageSkeleton'
import StatusBadge from '@/components/StatusBadge'
import Stepper, { toSteps } from '@/components/Stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import RecordPaymentDialog from '@/components/RecordPaymentDialog'

type Detail = {
  id: string
  invoiceNumber: string
  quoteNumber: string
  quotationId: string
  quoteStatus: string
  customer: string
  customerEmail: string
  customerTier: string
  type: string
  status: string
  amount: string
  issuedAt: string
  dueAt: string | null
  paidAt: string | null
  overdue: boolean
  lines: { id: string; product: string; quantity: number; unitPrice: string; discountPct: string; net: number }[]
  payments: { id: string; amount: string; method: string; paidAt: string }[]
  creditNotes: { id: string; amount: string; reason: string | null }[]
  paidTotal: number
  balance: number
  timeline: { key: string; label: string; done: boolean; at: string | null; note?: string }[]
}

const day = (d: string | null) => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canAct = !!user && ['finance', 'admin'].includes(user.role)
  const qc = useQueryClient()
  const [previewing, setPreviewing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')

  const inv = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => (await api.get(`/invoices/${id}`)).data as Detail,
  })

  const downloadPdf = async (invId: string, label: string) => {
    try {
      const res = await api.get(`/invoices/${invId}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${label}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(errText(e, 'Could not download the invoice'))
    }
  }

  const send = useMutation({
    mutationFn: async () => (await api.post(`/invoices/${id}/email`, { to: to.trim(), message: note.trim() || undefined })).data,
    onSuccess: () => {
      toast.success(`Invoice sent to ${to.trim()}`)
      setEmailing(false)
    },
    onError: (e) => toast.error(errText(e, 'Could not send the invoice')),
  })

  const crumbs = [
    { label: 'Workspace', to: '/' },
    { label: 'Invoices', to: '/invoices' },
  ]
  if (inv.isLoading)
    return (
      <AppShell crumbs={[...crumbs, { label: 'Loading…' }]}>
        <PageSkeleton />
      </AppShell>
    )
  if (!inv.data)
    return (
      <AppShell crumbs={[...crumbs, { label: 'Not found' }]}>
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
      </AppShell>
    )
  const d = inv.data
  const status = d.overdue && d.status !== 'paid' ? 'overdue' : d.status
  const openEmail = () => {
    setTo(d.customerEmail ?? '')
    setNote('')
    setEmailing(true)
  }
  const emailBad = to.trim() !== '' && !EMAIL.test(to.trim())

  return (
    <AppShell crumbs={[...crumbs, { label: d.invoiceNumber }]}>
      <div className="max-w-6xl space-y-6">
        {/* header: what it is, who for, where it stands, and what you can do */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{d.invoiceNumber}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.customer} · {d.type === 'onetime' ? 'One-time' : 'Recurring'} · issued {day(d.issuedAt)} · due {day(d.dueAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewing(true)}>
              <Eye className="size-4" /> Preview
            </Button>
            <Button variant="outline" onClick={openEmail}>
              <Mail className="size-4" /> Email
            </Button>
            <Button variant="outline" onClick={() => downloadPdf(d.id, d.invoiceNumber)}>
              <Download className="size-4" /> Download PDF
            </Button>
            {d.status !== 'paid' && d.balance > 0 && canAct && (
              <RecordPaymentDialog invoiceId={d.id} balance={d.balance} onDone={() => {
                qc.invalidateQueries({ queryKey: ['invoice', id] })
                qc.invalidateQueries({ queryKey: ['invoices'] })
              }} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="min-w-0 space-y-6">
            {/* order → cash progress; nothing shows as shipped while a backorder is open */}
            <div className="rounded-xl border bg-background p-5">
              <Stepper
                label="Order to cash"
                steps={toSteps(
                  (d.timeline ?? []).map((t) => ({ key: t.key, label: t.label, done: t.done, detail: t.at ? day(t.at) : t.note })),
                ).map((st) => (st.state === 'skipped' ? { ...st, detail: 'Skipped' } : st.state === 'upcoming' || st.state === 'current' ? { ...st, detail: st.detail ?? 'Not yet' } : st))}
              />
            </div>

            <div className="rounded-xl border bg-background p-5">
              <h2 className="mb-3 font-heading font-medium">{d.type === 'onetime' ? 'One-time' : 'Recurring'} charges</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.product}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(Number(l.unitPrice))}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(l.discountPct) ? `${Number(l.discountPct).toFixed(0)}%` : '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(l.net)}</TableCell>
                    </TableRow>
                  ))}
                  {d.lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No matching lines.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border bg-background p-5">
              <h2 className="mb-3 font-heading font-medium">Payments</h2>
              {d.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium">{humanize(p.method)} payment</span>
                        <span className="block text-xs text-muted-foreground">{format(new Date(p.paidAt), 'd MMM yyyy, HH:mm')}</span>
                      </span>
                      <span className="font-medium tabular-nums">{money(Number(p.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {d.creditNotes.length > 0 && (
              <div className="rounded-xl border bg-background p-5">
                <h2 className="mb-3 font-heading font-medium">Credit notes on this deal</h2>
                <ul className="divide-y text-sm">
                  {d.creditNotes.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 py-2">
                      <span>{c.reason}</span>
                      <span className="tabular-nums">{money(Number(c.amount))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="h-fit space-y-3 rounded-xl border bg-background p-5">
            <h2 className="font-heading font-medium">Summary</h2>
            <Row label="Customer" value={d.customer} />
            <Row label="Tier" value={humanize(d.customerTier)} />
            <Row
              label="Quote"
              value={
                <Link className="font-mono text-xs text-primary hover:underline" to={`/quotations/${d.quotationId}`}>
                  {d.quoteNumber}
                </Link>
              }
            />
            <Row label="Issued" value={day(d.issuedAt)} />
            <Row label="Due" value={day(d.dueAt)} />
            <div className="space-y-2 border-t pt-3">
              <Row label="Invoice total" value={money(Number(d.amount))} />
              <Row label="Paid" value={money(d.paidTotal)} />
              <div className="flex justify-between text-base font-semibold">
                <span>Balance</span>
                <span className={d.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>{money(d.balance)}</span>
              </div>
            </div>
            {d.status !== 'paid' && !canAct && <p className="text-[11px] text-muted-foreground">View only — payments are recorded by Finance.</p>}
          </aside>
        </div>
      </div>

      {/* the real PDF, same file the customer gets */}
      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="flex h-[88svh] max-w-[min(64rem,calc(100vw-2rem))] flex-col sm:max-w-[min(64rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Preview — {d.invoiceNumber}</DialogTitle>
            <DialogDescription>This is exactly the PDF that's downloaded and emailed.</DialogDescription>
          </DialogHeader>
          {previewing && (
            <iframe title={`Invoice ${d.invoiceNumber} preview`} src={`/api/invoices/${d.id}/pdf?inline=1`} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
          )}
          {/* the PDF viewer keeps Esc for itself once focused, so give a visible way out */}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailing} onOpenChange={setEmailing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {d.invoiceNumber}</DialogTitle>
            <DialogDescription>The invoice goes as a PDF attachment. The customer's email is filled in — change it if it should go elsewhere.</DialogDescription>
          </DialogHeader>
          <form
            id="email-invoice"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate()
            }}
          >
            <FormField id="inv-to" label="To" error={emailBad ? 'Enter a valid email address' : undefined}>
              <Input id="inv-to" type="email" autoFocus value={to} aria-invalid={emailBad} onChange={(e) => setTo(e.target.value)} />
            </FormField>
            <FormField id="inv-note" label="Message (optional)">
              <textarea
                id="inv-note"
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Thanks for your business — please find your invoice attached."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailing(false)}>
              Cancel
            </Button>
            <Button type="submit" form="email-invoice" disabled={!to.trim() || emailBad || send.isPending}>
              <Mail className="size-4" /> {send.isPending ? 'Sending…' : 'Send invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
