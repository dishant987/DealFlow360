import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import { Button } from '@/components/ui/button'

export default function Dashboard() {
  const { user } = useAuth()
  const isMgr = !!user && ['manager', 'finance', 'admin'].includes(user.role)

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
      </div>
    </AppShell>
  )
}
