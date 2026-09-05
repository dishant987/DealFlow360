import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Summary = {
  pendingApprovals: number
  openQuotations: number
  atRisk: number
  scope: 'yours' | 'all'
  activity: {
    id: string
    action: string
    customer: string
    user: string
    createdAt: string
    quotationId: string
    quoteNumber: string
  }[]
}

export default function Dashboard() {
  const { user } = useAuth()
  const isMgr = !!user && ['manager', 'finance', 'admin'].includes(user.role)
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: async () => (await api.get('/summary')).data as Summary,
  })

  const scope = summary.data?.scope === 'yours' ? 'yours' : 'across the team'
  const kpis = [
    {
      label: 'Pending Approvals',
      value: summary.data?.pendingApprovals,
      note: `waiting on a decision ${scope}`,
      to: isMgr ? '/approvals' : '/quotations',
    },
    {
      label: 'Open Quotations',
      value: summary.data?.openQuotations,
      note: `active deals ${scope}`,
      to: '/quotations',
    },
    {
      label: 'At-Risk Deals',
      value: summary.data?.atRisk,
      note: 'stalled, anomalous or backordered',
      to: isMgr ? '/deal-health' : '/quotations',
    },
  ]

  const tiles: { title: string; desc: string; to: string; show: boolean }[] = [
    { title: 'Quotations', desc: 'Build and track deals', to: '/quotations', show: true },
    { title: 'Approvals', desc: 'Review flagged discounts', to: '/approvals', show: isMgr },
    { title: 'Fulfillment', desc: 'Orders awaiting warehouse split', to: '/fulfillment', show: isMgr },
    { title: 'Invoices', desc: 'Outstanding & paid invoices', to: '/invoices', show: isMgr },
    { title: 'Subscriptions', desc: 'Recurring plans & renewals', to: '/subscriptions', show: isMgr },
    { title: 'Deal Health', desc: 'Stalled deals & anomalies', to: '/deal-health', show: isMgr },
    { title: 'Reports', desc: 'Performance & exports', to: '/reports', show: isMgr },
    {
      title: user?.role === 'admin' ? 'Backend Config' : 'Discount Config',
      desc: user?.role === 'admin' ? 'Products, tiers, warehouses' : 'Discount tiers & approval chain',
      to: '/admin',
      show: user?.role === 'admin' || user?.role === 'manager',
    },
  ]

  return (
    <AppShell crumbs={[{ label: 'Workspace' }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {user?.name}</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <b>{user?.role}</b>.
          </p>
        </div>
        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-3">
          {kpis.map((k) => (
            <Link
              key={k.label}
              to={k.to}
              className="rounded-lg border bg-background p-5 hover:border-primary hover:shadow-sm transition"
            >
              <div className="text-sm text-muted-foreground">{k.label}</div>
              {summary.isLoading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <div className="text-3xl font-semibold text-primary mt-1">{k.value ?? 0}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">{k.note}</div>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles
            .filter((t) => t.show)
            .map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="rounded-lg border bg-background p-5 hover:border-primary hover:shadow-sm transition"
              >
                <div className="font-medium text-primary">{t.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
              </Link>
            ))}
        </div>
        <Button asChild>
          <Link to="/quotations">Open Quotations</Link>
        </Button>

        {/* recent activity — straight off the audit trail */}
        <div className="rounded-lg border bg-background p-5">
          <h2 className="font-semibold mb-3">Recent Activity</h2>
          {summary.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (summary.data?.activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {(summary.data?.activity ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 border-b pb-1.5 last:border-0">
                  <Link to={`/quotations/${a.quotationId}`} className="font-medium text-primary hover:underline">
                    {a.quoteNumber}
                  </Link>
                  <span>
                    {a.customer} — {a.action}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {a.user} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  )
}
