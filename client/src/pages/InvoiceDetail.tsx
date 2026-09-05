import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import { errText } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import PageSkeleton from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canAct = !!user && ['finance', 'admin'].includes(user.role)
  const qc = useQueryClient()

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


  const inv = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => (await api.get(`/invoices/${id}`)).data as Detail,
  })

  const pay = async () => {
    try {
      await api.post(`/invoices/${id}/pay`)
      toast.success('Payment recorded')
      qc.invalidateQueries({ queryKey: ['invoice', id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e) {
      toast.error(errText(e, 'Could not record payment'))
    }
  }

  if (inv.isLoading)
    return (
      <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Invoices', to: '/invoices' }, { label: 'Loading…' }]}>
        <PageSkeleton />
      </AppShell>
    )
  if (!inv.data) return <div className="p-8 text-destructive">Invoice not found.</div>
  const d = inv.data

  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: 'Invoices', to: '/invoices' },
        { label: `${d.invoiceNumber} · ${d.customer}` },
      ]}
      actions={<StatusBadge status={d.overdue && d.status !== 'paid' ? 'overdue' : d.status} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] max-w-5xl">
        <section className="space-y-6">
          <div className="rounded-lg border bg-background p-4">
            <h2 className="font-semibold mb-3">
              {d.type === 'onetime' ? 'One-time' : 'Recurring'} charges
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Disc</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.product}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell className="text-right">${Number(l.unitPrice).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(l.discountPct).toFixed(0)}%</TableCell>
                    <TableCell className="text-right font-medium">${l.net.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {d.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm">
                      No matching lines.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border bg-background p-4">
            <h2 className="font-semibold mb-3">Payments</h2>
            {d.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex justify-between border-b py-1.5">
                    <span>
                      {p.method} · {new Date(p.paidAt).toLocaleString()}
                    </span>
                    <span className="font-medium">${Number(p.amount).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {d.creditNotes.length > 0 && (
            <div className="rounded-lg border bg-background p-4">
              <h2 className="font-semibold mb-3">Credit notes on this deal</h2>
              <ul className="text-sm space-y-1">
                {d.creditNotes.map((c) => (
                  <li key={c.id} className="flex justify-between border-b py-1.5">
                    <span>{c.reason}</span>
                    <span>${Number(c.amount).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-3 rounded-lg border bg-background p-4 h-fit">
          <h2 className="font-semibold">Summary</h2>
          <Row label="Invoice" value={<span className="font-mono text-xs">{d.invoiceNumber}</span>} />
          <Row label="Customer" value={d.customer} />
          <Row label="Tier" value={d.customerTier} />
          <Row label="Quote" value={<Link className="text-primary hover:underline font-mono text-xs" to={`/quotations/${d.quotationId}`}>{d.quoteNumber}</Link>} />
          <Row label="Issued" value={new Date(d.issuedAt).toLocaleDateString()} />
          <Row label="Due" value={d.dueAt ? new Date(d.dueAt).toLocaleDateString() : '—'} />
          <div className="border-t pt-2 space-y-2">
            <Row label="Invoice total" value={`$${Number(d.amount).toFixed(2)}`} />
            <Row label="Paid" value={`$${d.paidTotal.toFixed(2)}`} />
            <div className="flex justify-between font-semibold">
              <span>Balance</span>
              <span className={d.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                ${d.balance.toFixed(2)}
              </span>
            </div>
          </div>
          {d.status !== 'paid' && canAct && (
            <Button className="w-full" onClick={pay}>
              Record payment
            </Button>
          )}
          <Button
            className="w-full"
            variant="outline"
            onClick={() => downloadPdf(d.id, d.invoiceNumber)}
          >
            Download invoice PDF
          </Button>
          {d.status !== 'paid' && !canAct && (
            <p className="text-[11px] text-muted-foreground">
              View only — payments are recorded by Finance/Operations.
            </p>
          )}
        </aside>
      </div>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
