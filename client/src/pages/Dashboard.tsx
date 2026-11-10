import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { humanize, money } from '@/lib/format'
import AppShell from '@/components/AppShell'
import Panel from '@/components/Panel'
import StatCard from '@/components/StatCard'
import Stepper, { toSteps } from '@/components/Stepper'
import { Skeleton } from '@/components/ui/skeleton'

type Summary = {
  pendingApprovals: number
  scope: 'yours' | 'all'
  overview: {
    kpis: {
      openPipeline: number
      openCount: number
      wonThisMonth: number
      wonLastMonth: number
      winRate90d: number | null
      avgDiscountPct: number | null
    }
    pipeline: { stage: string; count: number; value: number }[]
    revenue: { month: string; amount: number }[]
  }
  tasks: { key: string; label: string; count: number; to: string }[]
  checklist: { products: boolean; customers: boolean; quotes: boolean; sent: boolean } | null
  activity: { id: string; action: string; customer: string; user: string; createdAt: string; quotationId: string; quoteNumber: string }[]
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' })
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function ChangeHint({ now, before }: { now: number; before: number }) {
  if (!before) return <>{now ? 'nothing won last month' : 'no wins yet this month'}</>
  const pct = Math.round(((now - before) / before) * 100)
  return (
    <span className={pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs last month
    </span>
  )
}

/** First-run checklist: shown only until a new company has done the basics. */
function Checklist({ steps, canConfigure }: { steps: NonNullable<Summary['checklist']>; canConfigure: boolean }) {
  const items = [
    { done: steps.products, label: 'Add your products', to: canConfigure ? '/admin' : null },
    { done: steps.customers, label: 'Add a customer', to: '/customers' },
    { done: steps.quotes, label: 'Create your first quotation', to: '/quotations' },
    { done: steps.sent, label: 'Send it to the customer', to: '/quotations' },
  ]
  return (
    <Panel title="Get set up" description="Four steps to your first quote. This disappears once you're done.">
      <Stepper
        label="Get set up"
        steps={toSteps(
          items.map((i) => ({
            key: i.label,
            label: i.to && !i.done ? (
              <Link to={i.to} className="hover:underline">
                {i.label}
              </Link>
            ) : (
              i.label
            ),
            done: i.done,
          })),
        )}
      />
    </Panel>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: async () => (await api.get('/summary')).data as Summary,
  })
  const d = summary.data
  const k = d?.overview.kpis
  const mine = d?.scope === 'yours'
  const tasks = (d?.tasks ?? []).filter((t) => t.count > 0)

  return (
    <AppShell crumbs={[{ label: 'Workspace' }]}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {mine ? 'your deals' : "the whole team's deals"}
          </p>
        </div>

        {d?.checklist && <Checklist steps={d.checklist} canConfigure={user?.role === 'admin' || user?.role === 'manager'} />}

        {/* 1. what needs me */}
        <Panel title="Needs your attention">
          {summary.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : tasks.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> You're all caught up.
            </p>
          ) : (
            <ul className="divide-y" aria-label="Tasks">
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link to={t.to} className="group flex items-center gap-3 py-2.5 text-sm">
                    <span className="grid min-w-9 place-items-center rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">
                      {t.count}
                    </span>
                    <span className="flex-1">{t.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 2. how are we doing */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open pipeline" value={k ? money(k.openPipeline) : '—'} hint={`${k?.openCount ?? 0} deals not yet won or lost`} to="/quotations" tone="primary" loading={summary.isLoading} />
          <StatCard label="Won this month" value={k ? money(k.wonThisMonth) : '—'} hint={k ? <ChangeHint now={k.wonThisMonth} before={k.wonLastMonth} /> : null} loading={summary.isLoading} />
          <StatCard label="Win rate" value={k?.winRate90d != null ? `${k.winRate90d}%` : '—'} hint="won ÷ decided, last 90 days" loading={summary.isLoading} />
          <StatCard label="Average discount" value={k?.avgDiscountPct != null ? `${k.avgDiscountPct}%` : '—'} hint="off list price, last 90 days" loading={summary.isLoading} />
        </div>

        {/* 3. where the deals are · and what just happened */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            <Panel title="Pipeline by stage" description="Value of the deals sitting at each step.">
              {/* horizontal bars: stage names stay readable at phone width */}
              <div className="h-60" role="img" aria-label="Bar chart of pipeline value by stage">
                {d && !d.overview.pipeline.some((p) => p.value) ? (
                  <p className="text-sm text-muted-foreground">No open deals yet — they'll show here by stage.</p>
                ) : d && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={d.overview.pipeline.map((p) => ({ ...p, name: humanize(p.stage) }))}>
                      <XAxis type="number" tickFormatter={(v) => compact.format(v)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={120} interval={0} />
                      <Tooltip
                        cursor={{ fill: 'var(--muted)' }}
                        contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                        formatter={(v, _n, item) => [
                          `${money(Number(v))} · ${(item as { payload?: { count?: number } }).payload?.count ?? 0} deals`,
                          'Value',
                        ]}
                      />
                      <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
            <Panel title="Revenue invoiced" description="Last six months.">
              <div className="h-48" role="img" aria-label="Bar chart of invoiced revenue by month">
                {d && !d.overview.revenue.some((r) => r.amount) ? (
                  <p className="text-sm text-muted-foreground">No invoices yet in the last six months.</p>
                ) : d && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.overview.revenue.map((r) => ({ ...r, name: monthLabel(r.month) }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis tickFormatter={(v) => compact.format(v)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={48} />
                      <Tooltip
                        cursor={{ fill: 'var(--muted)' }}
                        contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                        formatter={(v) => [money(Number(v)), 'Invoiced']}
                      />
                      <Bar dataKey="amount" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>

          <Panel title="Recent activity">
            {summary.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (d?.activity ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {(d?.activity ?? []).map((a) => (
                  <li key={a.id} className="min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{a.customer}</span> — {a.action}
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <Link to={`/quotations/${a.quotationId}`} className="font-mono text-primary hover:underline">
                        {a.quoteNumber}
                      </Link>
                      <span className="truncate">
                        {a.user} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
