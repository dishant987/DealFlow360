import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

type Outcome = 'pending' | 'returned' | 'approved' | 'rejected'
type Row = {
  id: string
  quoteNumber: string
  customer: string
  riskScore: string
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH'
  stage: string
  outcome: Outcome
  assignedTo: string
  yourStep: 'manager' | 'finance' | null
}
type Payload = {
  rows: Row[]
  summary: {
    pending: number
    returned: number
    approved: number
    rejected: number
    actionable: number
  }
}

const riskStyle: Record<Row['riskLabel'], string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-emerald-100 text-emerald-700',
}

const chipStyle: Record<Outcome, string> = {
  pending: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  returned: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  rejected: 'bg-red-100 text-red-700 hover:bg-red-200',
}

export default function Approvals() {
  const nav = useNavigate()

  const [outcome, setOutcome] = useState<Outcome | 'all'>('all')
  const [stage, setStage] = useState('')
  const [risk, setRisk] = useState('')
  const [customer, setCustomer] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const list = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => (await api.get('/approvals')).data as Payload,
  })

  const all = useMemo(() => list.data?.rows ?? [], [list.data])
  const s = list.data?.summary

  // Option lists come from the rows themselves, so they can never list a stage
  // or a customer that isn't there — and never miss one the server starts
  // sending.
  const stages = useMemo(
    () => [...new Set(all.map((r) => r.stage))].sort((a, b) => a.localeCompare(b)),
    [all],
  )
  const customers = useMemo(
    () => [...new Set(all.map((r) => r.customer))].sort((a, b) => a.localeCompare(b)),
    [all],
  )

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (outcome === 'all' || r.outcome === outcome) &&
          (!stage || r.stage === stage) &&
          (!risk || r.riskLabel === risk) &&
          (!customer || r.customer === customer) &&
          (!mineOnly || r.yourStep !== null),
      ),
    [all, outcome, stage, risk, customer, mineOnly],
  )

  const active =
    (outcome !== 'all' ? 1 : 0) + (stage ? 1 : 0) + (risk ? 1 : 0) + (customer ? 1 : 0) + (mineOnly ? 1 : 0)

  const clearAll = () => {
    setOutcome('all')
    setStage('')
    setRisk('')
    setCustomer('')
    setMineOnly(false)
  }

  const columns: Column<Row>[] = [
    {
      key: 'quoteNumber',
      label: 'Quotation',
      render: (r) => <span className="font-medium">{r.quoteNumber}</span>,
    },
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

  // the four counts double as the outcome filter — clicking one narrows to it,
  // clicking it again clears it
  const chip = (key: Outcome, label: string, n: number | undefined) => {
    const on = outcome === key
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOutcome(on ? 'all' : key)}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${chipStyle[key]} ${
          on ? 'ring-2 ring-current ring-offset-1' : ''
        }`}
      >
        {n ?? 0} {label}
      </button>
    )
  }

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Approvals' }]}>
      <DataTable
        rows={rows}
        columns={columns}
        loading={list.isLoading}
        onRowClick={(r) => nav(`/approvals/${r.id}`)}
        searchPlaceholder="Search quote #, customer or stage…"
        emptyMessage={
          active
            ? 'No quotation matches these filters.'
            : 'No quotation has been through approval yet.'
        }
        toolbar={
          <>
            {chip('pending', 'Pending', s?.pending)}
            {chip('returned', 'Returned', s?.returned)}
            {chip('approved', 'Approved', s?.approved)}
            {chip('rejected', 'Rejected', s?.rejected)}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={mineOnly ? 'default' : 'outline'}
                aria-pressed={mineOnly}
                onClick={() => setMineOnly((v) => !v)}
              >
                Needs my decision{s?.actionable != null && ` (${s.actionable})`}
              </Button>

              <Select
                aria-label="Filter by stage"
                className="h-8 w-40 text-xs"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                <option value="">All stages</option>
                {stages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filter by risk"
                className="h-8 w-32 text-xs"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              >
                <option value="">All risk</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </Select>

              <Select
                aria-label="Filter by customer"
                className="h-8 w-44 text-xs"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">All customers</option>
                {customers.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>

              {active > 0 && (
                <Button size="sm" variant="ghost" onClick={clearAll}>
                  <X className="size-3.5" />
                  Clear {active}
                </Button>
              )}
            </div>
          </>
        }
      />
    </AppShell>
  )
}
