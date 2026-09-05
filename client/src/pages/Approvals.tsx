import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'

type Row = {
  id: string
  quoteNumber: string
  customer: string
  riskScore: string
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH'
  stage: string
  outcome: 'pending' | 'returned' | 'approved' | 'rejected'
  assignedTo: string
  yourStep: 'manager' | 'finance' | null
}
type Payload = {
  rows: Row[]
  summary: { pending: number; returned: number; approved: number; rejected: number; actionable: number }
}

const riskStyle: Record<Row['riskLabel'], string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-emerald-100 text-emerald-700',
}

export default function Approvals() {
  const nav = useNavigate()
  const [pendingOnly, setPendingOnly] = useState(false)
  const list = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => (await api.get('/approvals')).data as Payload,
  })

  const all = list.data?.rows ?? []
  const rows = pendingOnly ? all.filter((r) => r.outcome === 'pending') : all
  const s = list.data?.summary

  const columns: Column<Row>[] = [
    { key: 'quoteNumber', label: 'Quotation', render: (r) => <span className="font-medium">{r.quoteNumber}</span> },
    { key: 'customer', label: 'Customer' },
    {
      key: 'riskLabel',
      label: 'Blended Risk',
      value: (r) => Number(r.riskScore),
      render: (r) => (
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${riskStyle[r.riskLabel]}`}>
          {r.riskLabel} · {Number(r.riskScore).toFixed(1)}
        </span>
      ),
    },
    { key: 'stage', label: 'Stage' },
    { key: 'assignedTo', label: 'Assigned To' },
    {
      key: 'action',
      label: '',
      sortable: false,
      render: (r) => (
        <Button size="sm" variant={r.yourStep ? 'default' : 'ghost'}>
          {r.yourStep ? 'Review' : 'View'}
        </Button>
      ),
    },
  ]

  const chip = (label: string, n: number | undefined, cls: string) => (
    <span className={`rounded px-2 py-1 text-xs font-medium ${cls}`}>
      {n ?? 0} {label}
    </span>
  )

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Approvals' }]}>
      <DataTable
        rows={rows}
        columns={columns}
        loading={list.isLoading}
        onRowClick={(r) => nav(`/approvals/${r.id}`)}
        searchPlaceholder="Search quote #, customer or stage…"
        emptyMessage={
          pendingOnly ? 'Nothing is pending approval.' : 'No quotation has been through approval yet.'
        }
        toolbar={
          <>
            {chip('Pending', s?.pending, 'bg-amber-100 text-amber-700')}
            {chip('Returned', s?.returned, 'bg-blue-100 text-blue-700')}
            {chip('Approved', s?.approved, 'bg-emerald-100 text-emerald-700')}
            {chip('Rejected', s?.rejected, 'bg-red-100 text-red-700')}
            <div className="ml-auto">
              <Button size="sm" variant={pendingOnly ? 'default' : 'outline'} onClick={() => setPendingOnly((v) => !v)}>
                {pendingOnly ? 'Showing pending only' : 'Filter: Pending Only'}
              </Button>
            </div>
          </>
        }
      />
    </AppShell>
  )
}
