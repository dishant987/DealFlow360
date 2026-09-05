import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import DataTable, { type Column } from '@/components/DataTable'

type Entry = {
  id: string
  createdAt: string
  action: string
  user: string
  reason: string | null
  detail: string
  quoteNumber: string
  customer: string | null
}

// colour the governance-critical actions so they stand out in a long list
const tone = (action: string) =>
  action.startsWith('approve')
    ? 'bg-emerald-100 text-emerald-800'
    : action.startsWith('reject') || action === 'cancelled'
      ? 'bg-red-100 text-red-800'
      : action.startsWith('return')
        ? 'bg-amber-100 text-amber-800'
        : action.startsWith('customer_')
          ? 'bg-violet-100 text-violet-800'
          : action.includes('payment') || action.includes('billing')
            ? 'bg-sky-100 text-sky-800'
            : 'bg-muted text-foreground'

const columns: Column<Entry>[] = [
  {
    key: 'createdAt',
    label: 'When',
    value: (r) => new Date(r.createdAt).getTime(),
    render: (r) => (
      <span className="whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</span>
    ),
  },
  {
    key: 'quoteNumber',
    label: 'Quote #',
    render: (r) => <span className="font-mono text-xs">{r.quoteNumber || '—'}</span>,
  },
  { key: 'customer', label: 'Customer', render: (r) => r.customer ?? '—' },
  {
    key: 'action',
    label: 'Action',
    render: (r) => (
      <span className={`rounded px-2 py-0.5 text-xs ${tone(r.action)}`}>
        {r.action.replace(/_/g, ' ')}
      </span>
    ),
  },
  { key: 'user', label: 'By' },
  { key: 'reason', label: 'Reason', render: (r) => r.reason ?? '—' },
  {
    key: 'detail',
    label: 'Details',
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground break-all">{r.detail || '—'}</span>
    ),
  },
]

export default function AuditLog() {
  const audit = useQuery({
    queryKey: ['/config/audit'],
    queryFn: async () => (await api.get('/config/audit')).data as Entry[],
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every approval, rejection and edit — with the user, timestamp and reason. Newest first
        (latest 500).
      </p>
      <DataTable
        rows={audit.data ?? []}
        columns={columns}
        loading={audit.isLoading}
        pageSize={15}
        searchPlaceholder="Search action, quote #, customer or user…"
        emptyMessage="No audit entries yet."
      />
    </div>
  )
}
