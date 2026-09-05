import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">DealFlow360 · Approvals</span>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/">Workspace</Link>
        </Button>
      </header>

      <main className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Risk score</TableHead>
              <TableHead>Your step</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).map((q) => (
              <TableRow key={q.id} className="cursor-pointer" onClick={() => nav(`/approvals/${q.id}`)}>
                <TableCell className="font-medium">{q.customer}</TableCell>
                <TableCell className="text-right">{Number(q.riskScore).toFixed(1)}</TableCell>
                <TableCell className="capitalize">{q.yourStep}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {list.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  Nothing awaiting your approval.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </main>
    </div>
  )
}
