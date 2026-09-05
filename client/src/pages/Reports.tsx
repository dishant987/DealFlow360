import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Filters = { from?: string; to?: string; status?: string; repId?: string; categoryId?: string }
type Row = { id: string; customer: string; rep: string; status: string; riskScore: number; amount: number }
type Report = {
  rows: Row[]
  summary: { count: number; totalValue: number; avgRisk: number; byStatus: Record<string, number> }
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
    count,
  }))

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">DealFlow360 · Reports</span>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/">Workspace</Link>
        </Button>
      </header>

      <main className="p-6 space-y-6">
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
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {options.data?.statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.repId ?? ''}
            onChange={(e) => set('repId', e.target.value)}
          >
            <option value="">All reps</option>
            {options.data?.reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={filters.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">All categories</option>
            {options.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Quotations</div>
            <div className="text-2xl font-semibold">{report.data?.summary.count ?? 0}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Total value</div>
            <div className="text-2xl font-semibold">
              ${(report.data?.summary.totalValue ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Avg risk score</div>
            <div className="text-2xl font-semibold">{(report.data?.summary.avgRisk ?? 0).toFixed(1)}</div>
          </div>
        </div>

        {/* chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="status" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.446 0.063 344.5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Rep</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Risk</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(report.data?.rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.customer}</TableCell>
                <TableCell>{r.rep}</TableCell>
                <TableCell>{r.status.replace(/_/g, ' ')}</TableCell>
                <TableCell className="text-right">{r.riskScore.toFixed(1)}</TableCell>
                <TableCell className="text-right">${r.amount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </main>
    </div>
  )
}
