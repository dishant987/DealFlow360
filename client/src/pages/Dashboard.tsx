import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  FileText,
  Receipt,
  RefreshCcw,
  Settings2,
  Truck,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import AppShell from '@/components/AppShell'
import Panel from '@/components/Panel'
import StatCard from '@/components/StatCard'
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

  const tiles: { title: string; desc: string; to: string; icon: LucideIcon; show: boolean }[] = [
    {
      title: 'Quotations',
      desc: 'Build and track deals',
      to: '/quotations',
      icon: FileText,
      show: true,
    },
    {
      title: 'Approvals',
      desc: 'Review flagged discounts',
      to: '/approvals',
      icon: BadgeCheck,
      show: isMgr,
    },
    {
      title: 'Fulfillment',
      desc: 'Orders awaiting warehouse split',
      to: '/fulfillment',
      icon: Truck,
      show: isMgr,
    },
    {
      title: 'Invoices',
      desc: 'Outstanding & paid invoices',
      to: '/invoices',
      icon: Receipt,
      show: isMgr,
    },
    {
      title: 'Subscriptions',
      desc: 'Recurring plans & renewals',
      to: '/subscriptions',
      icon: RefreshCcw,
      show: isMgr,
    },
    {
      title: 'Deal Health',
      desc: 'Stalled deals & anomalies',
      to: '/deal-health',
      icon: Activity,
      show: isMgr,
    },
    {
      title: 'Reports',
      desc: 'Performance & exports',
      to: '/reports',
      icon: BarChart3,
      show: isMgr,
    },
    {
      title: user?.role === 'admin' ? 'Backend Config' : 'Discount Config',
      desc:
        user?.role === 'admin'
          ? 'Products, tiers, warehouses'
          : 'Discount tiers & approval chain',
      to: '/admin',
      icon: Settings2,
      show: user?.role === 'admin' || user?.role === 'manager',
    },
  ]

  return (
    <AppShell crumbs={[{ label: 'Workspace' }]}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold">Welcome, {user?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{roleLabel(user?.role)}</span>.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Pending Approvals"
            value={summary.data?.pendingApprovals ?? 0}
            hint={`waiting on a decision ${scope}`}
            to={isMgr ? '/approvals' : '/quotations'}
            tone="primary"
            loading={summary.isLoading}
          />
          <StatCard
            label="Open Quotations"
            value={summary.data?.openQuotations ?? 0}
            hint={`active deals ${scope}`}
            to="/quotations"
            tone="primary"
            loading={summary.isLoading}
          />
          <StatCard
            label="At-Risk Deals"
            value={summary.data?.atRisk ?? 0}
            hint="stalled, anomalous or backordered"
            to={isMgr ? '/deal-health' : '/quotations'}
            tone={summary.data && summary.data.atRisk > 0 ? 'warning' : 'primary'}
            loading={summary.isLoading}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles
            .filter((t) => t.show)
            .map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="group flex items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <t.icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{t.desc}</div>
                </div>
              </Link>
            ))}
        </div>

        {/* recent activity — straight off the audit trail */}
        <Panel title="Recent Activity">
          {summary.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (summary.data?.activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(summary.data?.activity ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-2 first:pt-0 last:pb-0">
                  <Link
                    to={`/quotations/${a.quotationId}`}
                    className="font-mono text-xs font-medium text-primary hover:underline"
                  >
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
        </Panel>
      </div>
    </AppShell>
  )
}
