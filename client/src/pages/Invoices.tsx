import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import { errText } from '@/lib/errors'
import AppShell from '@/components/AppShell'
import DataTable, { type Column, type TableQuery } from '@/components/DataTable'
import StatCard from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { humanize, money } from '@/lib/format'
import { format } from 'date-fns'
import { Download } from 'lucide-react'

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


  // step 18: one page at a time; the summary cards are totals over every invoice
  const [tq, setTq] = useState<TableQuery>({ page: 1, search: '', sort: null })
  const q = useQuery({
    queryKey: ['invoices', 'page', status, tq],
    queryFn: async () =>
      (
        await api.get('/invoices', {
          params: { status: status || undefined, page: tq.page, pageSize: 10, q: tq.search || undefined, sort: tq.sort?.key, dir: tq.sort?.dir },
        })
      ).data as Payload & { total: number },
    placeholderData: keepPreviousData,
  })

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      sortKey: 'number',
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
    { key: 'customer',
      sortKey: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type', render: (r) => (r.type === 'onetime' ? 'One-time' : humanize(r.type)) },
    {
      key: 'status',
      sortKey: 'status',
      label: 'Status',
      render: (r) => (
        <StatusBadge status={r.overdue && r.status !== 'paid' ? 'overdue' : r.status} />
      ),
    },
    {
      key: 'amount',
      sortKey: 'amount',
      label: 'Amount',
      align: 'right',
      value: (r) => Number(r.amount),
      render: (r) => money(Number(r.amount)),
    },
    {
      key: 'issuedAt',
      sortKey: 'issued',
      label: 'Issued',
      value: (r) => new Date(r.issuedAt).getTime(),
      render: (r) => format(new Date(r.issuedAt), 'd MMM yyyy'),
    },
    {
      key: 'dueAt',
      sortKey: 'due',
      label: 'Due',
      value: (r) => (r.dueAt ? new Date(r.dueAt).getTime() : 0),
      render: (r) =>
        r.dueAt ? (
          <span className={r.overdue && r.status !== 'paid' ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
            {format(new Date(r.dueAt), 'd MMM yyyy')}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: '__dl',
      label: '',
      sortable: false,
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Download ${r.invoiceNumber} as PDF`}
          onClick={(e) => {
            e.stopPropagation()
            downloadPdf(r.id, r.invoiceNumber)
          }}
        >
          <Download className="size-4" /> PDF
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
            value={money((s?.outstanding ?? 0))}
            hint="not yet settled"
            loading={q.isLoading}
          />
          <StatCard
            label="Paid"
            value={money((s?.paid ?? 0))}
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
          server={{ total: q.data?.total ?? 0, onChange: setTq }}
          resetPageOn={status}
          onRowClick={(r) => nav(`/invoices/${r.id}`)}
          searchPlaceholder="Search invoice #, quote # or customer…"
          emptyMessage="No invoices yet."
          toolbar={
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="sent">Pending only</option>
              <option value="overdue">Overdue</option>
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
