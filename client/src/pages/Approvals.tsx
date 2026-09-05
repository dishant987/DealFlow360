import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'

type Pending = {
  id: string
  customer: string
  riskScore: string
  requiresFinance: boolean
  yourStep: 'manager' | 'finance'
}

export default function Approvals() {
  const nav = useNavigate()
  const list = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => (await api.get('/approvals')).data as Pending[],
  })

  const columns: Column<Pending>[] = [
    { key: 'customer', label: 'Customer', render: (r) => <span className="font-medium">{r.customer}</span> },
    {
      key: 'riskScore',
      label: 'Risk score',
      align: 'right',
      value: (r) => Number(r.riskScore),
      render: (r) => Number(r.riskScore).toFixed(1),
    },
    { key: 'yourStep', label: 'Your step', render: (r) => <span className="capitalize">{r.yourStep}</span> },
    {
      key: 'action',
      label: '',
      sortable: false,
      render: () => (
        <Button size="sm" variant="ghost">
          Review
        </Button>
      ),
    },
  ]

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Approvals' }]}>
      <DataTable
        rows={list.data ?? []}
        columns={columns}
        loading={list.isLoading}
        onRowClick={(r) => nav(`/approvals/${r.id}`)}
        searchPlaceholder="Search customer…"
        emptyMessage="Nothing awaiting your approval."
      />
    </AppShell>
  )
}
