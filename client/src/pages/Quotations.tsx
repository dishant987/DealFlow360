import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import KanbanBoard, { type Quote } from '@/components/KanbanBoard'
import { Button } from '@/components/ui/button'

type Customer = { id: string; name: string; tier: string }

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-foreground',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  sent: 'bg-sky-100 text-sky-800',
  under_negotiation: 'bg-violet-100 text-violet-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  fulfilled: 'bg-emerald-100 text-emerald-800',
  invoiced: 'bg-emerald-100 text-emerald-800',
}

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

  const columns: Column<Quote>[] = [
    {
      key: 'customer',
      label: 'Customer',
      render: (r) => <span className="font-medium">{r.customer}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <span className={`rounded px-2 py-0.5 text-xs ${statusColors[r.status] ?? 'bg-muted'}`}>
          {r.status.replace(/_/g, ' ')}
        </span>
      ),
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
      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
      >
        <option value="">Select customer…</option>
        {(customers.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.tier})
          </option>
        ))}
      </select>
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
          searchPlaceholder="Search customer or status…"
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
