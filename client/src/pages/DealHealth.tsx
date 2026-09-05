import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

type Health = {
  stalledDays: number
  stalled: { id: string; customer: string; rep: string; status: string; daysInactive: number }[]
  anomalies: { id: string; customer: string; rep: string; riskScore: number; repAvg: number }[]
  slippage: { id: string; customer: string }[]
}

export default function DealHealth() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const health = useQuery({
    queryKey: ['deal-health'],
    queryFn: async () => (await api.get('/dashboard')).data as Health,
  })

  const nudge = async (id: string) => {
    try {
      await api.post(`/dashboard/quotations/${id}/nudge`)
      toast.success('Nudge sent')
      qc.invalidateQueries({ queryKey: ['deal-health'] })
    } catch {
      toast.error('Nudge failed')
    }
  }

  const h = health.data
  const card = 'rounded-lg border p-4'

  return (
    <div className="min-h-svh">
      <header className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">DealFlow360 · Deal Health</span>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/">Workspace</Link>
        </Button>
      </header>

      <main className="p-6 space-y-8">
        <section className={card}>
          <h2 className="font-semibold mb-2">
            Stalled deals <span className="text-muted-foreground text-sm">(&gt; {h?.stalledDays}d inactive)</span>
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Idle</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(h?.stalled ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.customer}</TableCell>
                  <TableCell>{s.rep}</TableCell>
                  <TableCell>{s.status.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-amber-600">{s.daysInactive}d</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => nav(`/quotations/${s.id}`)}>
                      Open
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => nudge(s.id)}>
                      Nudge
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {h?.stalled.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    No stalled deals.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className={card}>
          <h2 className="font-semibold mb-2">Discount anomalies</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Risk score</TableHead>
                <TableHead className="text-right">Rep avg</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(h?.anomalies ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.customer}</TableCell>
                  <TableCell>{a.rep}</TableCell>
                  <TableCell className="text-right text-red-600 font-medium">
                    {a.riskScore.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {a.repAvg.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => nav(`/quotations/${a.id}`)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {h?.anomalies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    No anomalies.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className={card}>
          <h2 className="font-semibold mb-2">Delivery slippage (backorders)</h2>
          {(h?.slippage.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">No backordered deliveries.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {h!.slippage.map((s) => (
                <li key={s.id} className="flex justify-between border-b py-1">
                  <span>{s.customer}</span>
                  <Button size="sm" variant="ghost" onClick={() => nav(`/quotations/${s.id}/fulfillment`)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
