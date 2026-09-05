import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import { errText } from '@/lib/errors'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import StatCard from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

type Invoice = {
  id: string
  invoiceNumber: string
  quoteNumber: string
  quotationId: string
  customer: string
  type: string
  status: string
  amount: string
  issuedAt: string
  dueAt: string | null
  overdue: boolean
}
type Payload = {
  invoices: Invoice[]
  summary: { count: number; outstanding: number; paid: number; overdue: number }
}

export default function Invoices() {
  const nav = useNavigate()
  const [status, setStatus] = useState('')

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


  const q = useQuery({
    queryKey: ['invoices', status],
    queryFn: async () =>
      (await api.get('/invoices', { params: status ? { status } : {} })).data as Payload,
  })

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (r) => <span className="font-mono text-xs font-medium">{r.invoiceNumber}</span>,
    },
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => (
        <Link
          to={`/quotations/${r.quotationId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-primary hover:underline"
        >
          {r.quoteNumber}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <StatusBadge status={r.overdue && r.status !== 'paid' ? 'overdue' : r.status} />
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      value: (r) => Number(r.amount),
      render: (r) => `$${Number(r.amount).toFixed(2)}`,
    },
    {
      key: 'issuedAt',
      label: 'Issued',
      value: (r) => new Date(r.issuedAt).getTime(),
      render: (r) => new Date(r.issuedAt).toLocaleDateString(),
    },
    {
      key: 'dueAt',
      label: 'Due',
      value: (r) => (r.dueAt ? new Date(r.dueAt).getTime() : 0),
      render: (r) => (r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '—'),
    },
    {
      key: '__dl',
      label: '',
      sortable: false,
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            downloadPdf(r.id, r.invoiceNumber)
          }}
        >
          PDF
        </Button>
      ),
    },
  ]

  const s = q.data?.summary

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Invoices' }]}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Invoices" value={s?.count ?? 0} loading={q.isLoading} />
          <StatCard
            label="Outstanding"
            value={`$${(s?.outstanding ?? 0).toFixed(2)}`}
            hint="not yet settled"
            loading={q.isLoading}
          />
          <StatCard
            label="Paid"
            value={`$${(s?.paid ?? 0).toFixed(2)}`}
            tone="success"
            loading={q.isLoading}
          />
          <StatCard
            label="Overdue"
            value={s?.overdue ?? 0}
            hint="past their due date"
            tone={(s?.overdue ?? 0) > 0 ? 'danger' : 'default'}
            loading={q.isLoading}
          />
        </div>

        <DataTable
          rows={q.data?.invoices ?? []}
          columns={columns}
          loading={q.isLoading}
          onRowClick={(r) => nav(`/invoices/${r.id}`)}
          searchPlaceholder="Search quote #, customer or status…"
          emptyMessage="No invoices yet."
          toolbar={
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="sent">Pending only</option>
              <option value="paid">Paid only</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </Select>
          }
        />
      </div>
    </AppShell>
  )
}
