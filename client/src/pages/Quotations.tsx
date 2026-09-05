import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Customer = { id: string; name: string; tier: string }
type Quote = {
  id: string
  customer: string
  status: string
  amount: number
  riskScore: string
  updatedAt: string
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-foreground',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
}

export default function Quotations() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')

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

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">DealFlow360 · Quotations</span>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/">Workspace</Link>
        </Button>
      </header>

      <main className="p-6 space-y-6">
        <div className="flex items-center gap-2">
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
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Risk</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(quotes.data ?? []).map((q) => (
              <TableRow key={q.id} className="cursor-pointer" onClick={() => nav(`/quotations/${q.id}`)}>
                <TableCell className="font-medium">{q.customer}</TableCell>
                <TableCell>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${statusColors[q.status] ?? 'bg-muted'}`}
                  >
                    {q.status.replace(/_/g, ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-right">${q.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right">{Number(q.riskScore).toFixed(1)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {quotes.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  No quotations yet — pick a customer and create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </main>
    </div>
  )
}
