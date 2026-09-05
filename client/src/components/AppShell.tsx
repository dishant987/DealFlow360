import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  FileText,
  LayoutDashboard,
  Menu,
  PanelsTopLeft,
  Receipt,
  RefreshCcw,
  RefreshCw,
  Settings2,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import UserMenu from '@/components/UserMenu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export type Crumb = { label: string; to?: string }

type NavEntry = {
  to: string
  label: string
  icon: LucideIcon
  badgeKey?: 'pendingApprovals'
}

function navFor(role: string | undefined): NavEntry[] {
  const isMgr = !!role && ['manager', 'finance', 'admin'].includes(role)
  // icons match the Workspace tiles, so the same concept looks the same everywhere
  return [
    { to: '/', label: 'Workspace', icon: LayoutDashboard },
    { to: '/quotations', label: 'Quotations', icon: FileText },
    ...(isMgr
      ? [
          {
            to: '/approvals',
            label: 'Approvals',
            icon: BadgeCheck,
            badgeKey: 'pendingApprovals' as const,
          },
          { to: '/fulfillment', label: 'Fulfillment', icon: Truck },
          { to: '/invoices', label: 'Invoices', icon: Receipt },
          { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCcw },
          { to: '/deal-health', label: 'Deal Health', icon: Activity },
          { to: '/reports', label: 'Reports', icon: BarChart3 },
        ]
      : []),
    ...(role === 'admin' || role === 'manager'
      ? [{ to: '/admin', label: 'Config', icon: Settings2 }]
      : []),
  ]
}

function NavItem({
  to,
  icon: Icon,
  badge,
  children,
}: {
  to: string
  icon: LucideIcon
  badge?: number
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
          isActive
            ? 'bg-white text-primary font-medium shadow-sm'
            : 'text-primary-foreground/85 hover:bg-white/10 hover:text-primary-foreground'
        }`
      }
    >
      {/* Nine labelled items plus icons need 2xl. At xl the icons push the last
          item under the workspace actions, so labels carry it alone until then. */}
      <Icon className="hidden size-4 shrink-0 2xl:block" />
      {children}
      {!!badge && badge > 0 && (
        <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950 tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export default function AppShell({
  crumbs = [],
  actions,
  children,
}: {
  crumbs?: Crumb[]
  actions?: ReactNode
  children: ReactNode
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const entries = navFor(user?.role)

  // shares its cache with the Workspace dashboard, so this costs nothing extra
  // on most navigations; the badge just surfaces what is already waiting
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: async () => (await api.get('/summary')).data as { pendingApprovals: number },
    staleTime: 30_000,
    enabled: !!user,
  })
  const badgeFor = (e: NavEntry) =>
    e.badgeKey === 'pendingApprovals' ? summary.data?.pendingApprovals : undefined

  // B1: pull fresh pricing / stock / approval data from the backend
  const reloadData = async () => {
    await qc.invalidateQueries()
    toast.success('Data reloaded from backend')
  }

  // B1: end the current working session view (clears cached workspace data)
  const closeWorkspace = () => {
    qc.clear()
    nav('/')
  }

  return (
    <div className="min-h-svh bg-muted/20">
      {/* Odoo-style purple top bar. Single row that never wraps: the nav collapses
          into a sheet below lg, and the workspace actions shed their labels first. */}
      <header className="bg-primary text-primary-foreground">
        <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="-ml-1 shrink-0 px-2 text-primary-foreground hover:bg-white/10 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="text-primary">DealFlow360</SheetTitle>
                {user && (
                  <p className="text-xs text-muted-foreground">
                    {user.name} · <span className="uppercase">{user.role}</span>
                  </p>
                )}
              </SheetHeader>
              <nav className="flex flex-col gap-0.5 px-3">
                {entries.map((e) => (
                  <NavLink
                    key={e.to}
                    to={e.to}
                    end={e.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-muted'
                      }`
                    }
                  >
                    <e.icon className="size-4 shrink-0" />
                    {e.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto space-y-1 border-t px-3 py-3">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false)
                    reloadData()
                  }}
                >
                  <RefreshCw className="size-4" /> Reload data
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false)
                    closeWorkspace()
                  }}
                >
                  <PanelsTopLeft className="size-4" /> Close workspace
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Link
            to="/"
            className="shrink-0 font-semibold tracking-tight whitespace-nowrap lg:border-r lg:border-white/20 lg:pr-4"
          >
            DealFlow360
          </Link>

          <nav className="hidden min-w-0 items-center gap-0.5 lg:flex">
            {entries.map((e) => (
              <NavItem key={e.to} to={e.to} icon={e.icon} badge={badgeFor(e)}>
                {e.label}
              </NavItem>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-sm">
            <Button
              size="sm"
              variant="ghost"
              className="hidden px-2 text-primary-foreground hover:bg-white/10 xl:inline-flex"
              onClick={reloadData}
              title="Refresh pricing, stock and approval data"
            >
              <RefreshCw className="size-4" />
              <span className="sr-only min-[1700px]:not-sr-only">Reload Data</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="hidden px-2 text-primary-foreground hover:bg-white/10 xl:inline-flex"
              onClick={closeWorkspace}
              title="End the current working session view"
            >
              <PanelsTopLeft className="size-4" />
              <span className="sr-only min-[1700px]:not-sr-only">Close Workspace</span>
            </Button>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/20 xl:block" />
            <UserMenu onReloadData={reloadData} onCloseWorkspace={closeWorkspace} />
          </div>
        </div>
      </header>

      {/* breadcrumb bar */}
      <div className="flex min-h-[41px] flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 sm:px-6">
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="opacity-40">/</span>}
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <main className="p-4 sm:p-6">{children}</main>
    </div>
  )
}
