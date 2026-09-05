import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

export type Quote = {
  id: string
  customer: string
  status: string
  amount: number
  riskScore: string
  updatedAt: string
}

type StageKey = 'draft' | 'pending' | 'approved' | 'customer' | 'confirmed' | 'done' | 'rejected'

const STAGES: { key: StageKey; title: string; statuses: string[]; accent: string }[] = [
  { key: 'draft', title: 'Draft', statuses: ['draft'], accent: 'bg-slate-400' },
  { key: 'pending', title: 'Pending Approval', statuses: ['pending_approval'], accent: 'bg-amber-500' },
  { key: 'approved', title: 'Approved', statuses: ['approved'], accent: 'bg-emerald-500' },
  {
    key: 'customer',
    title: 'With Customer',
    statuses: ['sent', 'under_negotiation'],
    accent: 'bg-violet-500',
  },
  { key: 'confirmed', title: 'Confirmed', statuses: ['confirmed'], accent: 'bg-teal-500' },
  {
    key: 'done',
    title: 'Fulfilled / Invoiced',
    statuses: ['fulfilled', 'invoiced'],
    accent: 'bg-primary',
  },
  { key: 'rejected', title: 'Rejected', statuses: ['rejected', 'cancelled'], accent: 'bg-red-500' },
]

const stageOf = (status: string) => STAGES.find((s) => s.statuses.includes(status))?.key

// Which drags are real actions, vs. steps the governance engine owns.
// A string result = refuse the drop and explain why in plain language.
function planMove(quote: Quote, to: StageKey): { run: () => Promise<string> } | string {
  const from = stageOf(quote.status)
  if (from === to) return 'no-op'

  if (quote.status === 'fulfilled' || quote.status === 'invoiced')
    return 'This deal is already fulfilled — it can no longer be moved.'

  // Draft → submit. The blended risk score decides where it actually lands.
  if (from === 'draft' && (to === 'pending' || to === 'approved'))
    return {
      run: async () => {
        const { data } = await api.post(`/quotations/${quote.id}/submit`)
        return data.risk.level === 'none'
          ? 'Within discount limits — approved and ready for fulfillment.'
          : `Routed for approval: ${
              data.risk.requiresFinance ? 'Manager → Finance' : 'Manager'
            } (risk ${data.risk.score}).`
      },
    }

  // Approved → send the portal link to the customer
  if (from === 'approved' && to === 'customer')
    return {
      run: async () => {
        const { data } = await api.post(`/quotations/${quote.id}/send`)
        return data.emailed
          ? `Quotation sent to ${data.sentTo}.`
          : 'Portal link generated (no SMTP configured — check the server console).'
      },
    }

  // Anything still open → cancel
  if (to === 'rejected')
    return {
      run: async () => {
        await api.post(`/quotations/${quote.id}/cancel`, { reason: 'Cancelled from pipeline' })
        return 'Deal marked as cancelled.'
      },
    }

  // Everything else belongs to a governed step — point the user at the right screen.
  if (to === 'approved' && from === 'pending')
    return 'Approvals are decided on the Approvals screen — a manager has to review this deal.'
  if (to === 'confirmed') return 'Only the customer can confirm, from their portal link.'
  if (to === 'done')
    return 'Fulfillment comes from the warehouse split. Open the quote → Fulfillment.'
  if (to === 'pending') return 'Only a draft can be submitted for approval.'
  if (to === 'customer') return 'A quotation has to be approved before it goes to the customer.'
  return 'That move is not allowed from this stage.'
}

export default function KanbanBoard({ quotes, loading }: { quotes: Quote[]; loading?: boolean }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageKey | null>(null)
  const [busy, setBusy] = useState(false)

  const onDrop = async (to: StageKey) => {
    setOverStage(null)
    const quote = quotes.find((q) => q.id === dragId)
    setDragId(null)
    if (!quote || busy) return

    const plan = planMove(quote, to)
    if (typeof plan === 'string') {
      if (plan !== 'no-op') toast.error(plan)
      return
    }

    setBusy(true)
    try {
      toast.success(await plan.run())
      qc.invalidateQueries({ queryKey: ['quotations'] })
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Could not move this deal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const cards = quotes.filter((q) => stage.statuses.includes(q.status))
        const value = cards.reduce((s, c) => s + c.amount, 0)
        const isTarget = overStage === stage.key
        return (
          <div
            key={stage.key}
            className="w-64 shrink-0"
            onDragOver={(e) => {
              e.preventDefault()
              setOverStage(stage.key)
            }}
            onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
            onDrop={() => onDrop(stage.key)}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`h-2 w-2 rounded-full ${stage.accent}`} />
              <h2 className="text-sm font-medium">{stage.title}</h2>
              <span className="text-xs text-muted-foreground ml-auto">
                {cards.length} · ${value.toFixed(0)}
              </span>
            </div>

            <div
              className={`space-y-2 rounded-lg p-2 min-h-32 transition-colors ${
                isTarget ? 'bg-primary/10 ring-2 ring-primary/40' : 'bg-muted/40'
              }`}
            >
              {loading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}

              {!loading &&
                cards.map((q) => (
                  <div
                    key={q.id}
                    draggable={!busy}
                    onDragStart={() => setDragId(q.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverStage(null)
                    }}
                    onClick={() => nav(`/quotations/${q.id}`)}
                    className={`cursor-grab active:cursor-grabbing rounded-md border bg-background p-3 hover:border-primary hover:shadow-sm transition ${
                      dragId === q.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="font-medium text-sm">{q.customer}</div>
                    <div className="text-sm text-muted-foreground">${q.amount.toFixed(2)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {q.status.replace(/_/g, ' ')}
                      </span>
                      {Number(q.riskScore) > 0 && (
                        <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                          risk {Number(q.riskScore).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

              {!loading && cards.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">Drop a deal here</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
