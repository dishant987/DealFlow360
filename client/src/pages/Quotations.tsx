import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import KanbanBoard, { type Quote } from '@/components/KanbanBoard'
import { Trash2 } from 'lucide-react'
import { errText } from '@/lib/errors'
import ConfirmButton from '@/components/ConfirmButton'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

type Customer = { id: string; name: string; tier: string }

export default function Quotations() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  // remembered per browser so the rep keeps their preferred view
  const [view, setView] = useState<'table' | 'kanban'>(
    () => (localStorage.getItem('quotations.view') as 'table' | 'kanban') ?? 'table',
  )
  const pickView = (v: 'table' | 'kanban') => {
    setView(v)
    localStorage.setItem('quotations.view', v)
  }

  const quotes = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => (await api.get('/quotations')).data as Quote[],
  })
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data as Customer[],
  })

  const create = useMutation({
    mutationFn: async () => (await api.post('/quotations', { customerId })).data as { id: string },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      nav(`/quotations/${q.id}`)
    },
    onError: () => toast.error('Could not create quotation'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/quotations/${id}`)).data,
    onSuccess: (d: { deleted?: string }) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      toast.success(d.deleted ? `${d.deleted} deleted` : 'Draft deleted')
    },
    onError: (e) => toast.error(errText(e, 'Could not delete this quotation')),
  })

  const columns: Column<Quote>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (r) => <span className="font-mono text-xs">{r.quoteNumber}</span>,
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (r) => <span className="font-medium">{r.customer}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      value: (r) => r.amount,
      render: (r) => `$${r.amount.toFixed(2)}`,
    },
    {
      key: 'riskScore',
      label: 'Risk',
      align: 'right',
      value: (r) => Number(r.riskScore),
      render: (r) => Number(r.riskScore).toFixed(1),
    },
    {
      key: 'updatedAt',
      label: 'Updated',
      value: (r) => new Date(r.updatedAt).getTime(),
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      // only drafts: everything further along has to be cancelled so its
      // history survives, which is what the server enforces too
      render: (r) =>
        r.status === 'draft' ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            title={`Delete ${r.quoteNumber}?`}
            description={`This permanently removes the draft for ${r.customer} and its lines. It cannot be undone.`}
            confirmLabel="Delete draft"
            onConfirm={() => remove.mutate(r.id)}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete draft</span>
          </ConfirmButton>
        ) : null,
    },
  ]

  const viewToggle = (
    <div className="inline-flex rounded-md border p-0.5">
      {(['table', 'kanban'] as const).map((v) => (
        <button
          key={v}
          onClick={() => pickView(v)}
          className={`px-3 py-1 text-sm rounded capitalize transition-colors ${
            view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )

  const newQuote = (
    <>
      <Select
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
      >
        <option value="">Select customer…</option>
        {(customers.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.tier})
          </option>
        ))}
      </Select>
      <Button disabled={!customerId || create.isPending} onClick={() => create.mutate()}>
        New Quotation
      </Button>
    </>
  )

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Quotations' }]}>
      {view === 'table' ? (
        <DataTable
          rows={quotes.data ?? []}
          columns={columns}
          loading={quotes.isLoading}
          onRowClick={(r) => nav(`/quotations/${r.id}`)}
          searchPlaceholder="Search quote #, customer or status…"
          emptyMessage="No quotations yet — pick a customer and create one."
          toolbar={
            <>
              {newQuote}
              <div className="ml-auto">{viewToggle}</div>
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {newQuote}
            <div className="ml-auto">{viewToggle}</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag a deal to move it forward — the system applies the right action and blocks moves
            that need approval or the customer.
          </p>
          <KanbanBoard quotes={quotes.data ?? []} loading={quotes.isLoading} />
        </div>
      )}
    </AppShell>
  )
}
