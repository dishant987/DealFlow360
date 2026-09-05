import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge, { statusColor } from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import StatCard from '@/components/StatCard'
import DataTable, { type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type Filters = { from?: string; to?: string; status?: string; repId?: string; categoryId?: string }
type Row = { id: string; quoteNumber: string; customer: string; rep: string; status: string; riskScore: number; amount: number }
type Report = {
  rows: Row[]
  summary: {
    count: number
    totalValue: number
    avgRisk: number
    avgApprovalHours: number | null
    approvalsMeasured: number
    topUpsell: { product: string; count: number } | null
    byStatus: Record<string, number>
  }
}

export default function Reports() {
  const [filters, setFilters] = useState<Filters>({})

  const options = useQuery({
    queryKey: ['report-filters'],
    queryFn: async () => (await api.get('/reports/filters')).data as {
      reps: { id: string; name: string }[]
      categories: { id: string; name: string }[]
      statuses: string[]
    },
  })

  const report = useQuery({
    queryKey: ['report', filters],
    queryFn: async () => (await api.get('/reports', { params: filters })).data as Report,
  })

  const set = (k: keyof Filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }))

  const exportFile = async (format: 'xls' | 'pdf') => {
    try {
      const res = await api.get('/reports/export', {
        params: { ...filters, format },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'pdf' ? 'report.pdf' : 'report.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  const chartData = Object.entries(report.data?.summary.byStatus ?? {}).map(([status, count]) => ({
    status: status.replace(/_/g, ' '),
    raw: status,
    count,
  }))

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Reports' }]}>
      <div className="space-y-6">
        {/* filters */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="text-xs text-muted-foreground">From</div>
            <Input type="date" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="text-sm">
            <div className="text-xs text-muted-foreground">To</div>
            <Input type="date" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value)} />
          </label>
          <Select
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {options.data?.statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Select
            value={filters.repId ?? ''}
            onChange={(e) => set('repId', e.target.value)}
          >
            <option value="">All reps</option>
            {options.data?.reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select
            value={filters.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">All categories</option>
            {options.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => exportFile('xls')}>
              Export XLS
            </Button>
            <Button variant="outline" onClick={() => exportFile('pdf')}>
              Export PDF
            </Button>
          </div>
        </div>

        {/* summary */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Quotations"
            value={report.data?.summary.count ?? 0}
            loading={report.isLoading}
          />
          <StatCard
            label="Total value"
            value={`$${(report.data?.summary.totalValue ?? 0).toFixed(2)}`}
            tone="primary"
            loading={report.isLoading}
          />
          <StatCard
            label="Avg risk score"
            value={(report.data?.summary.avgRisk ?? 0).toFixed(1)}
            loading={report.isLoading}
          />
          <StatCard
            label="Avg approval time"
            value={
              report.data?.summary.avgApprovalHours == null
                ? '—'
                : `${report.data.summary.avgApprovalHours}h`
            }
            hint={`${report.data?.summary.approvalsMeasured ?? 0} decided`}
            loading={report.isLoading}
          />
          <StatCard
            label="Top upsold product"
            value={
              <span className="block truncate text-lg">
                {report.data?.summary.topUpsell?.product ?? '—'}
              </span>
            }
            hint={
              report.data?.summary.topUpsell
                ? `${report.data.summary.topUpsell.count} added from suggestions`
                : 'no suggestions accepted yet'
            }
            loading={report.isLoading}
          />
        </div>

        {/* chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="status" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.raw} fill={statusColor(d.raw)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* table */}
        <DataTable
          rows={report.data?.rows ?? []}
          columns={reportColumns}
          loading={report.isLoading}
          searchPlaceholder="Search customer, rep or status…"
          emptyMessage="No quotations match these filters."
        />
      </div>
    </AppShell>
  )
}

const reportColumns: Column<Row>[] = [
  { key: 'quoteNumber', label: 'Quote #' },
  { key: 'customer', label: 'Customer' },
  { key: 'rep', label: 'Rep' },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'riskScore', label: 'Risk', align: 'right', render: (r) => r.riskScore.toFixed(1) },
  { key: 'amount', label: 'Amount', align: 'right', render: (r) => `$${r.amount.toFixed(2)}` },
]
