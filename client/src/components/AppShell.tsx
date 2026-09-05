import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Menu, RefreshCw, PanelsTopLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import UserMenu from '@/components/UserMenu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export type Crumb = { label: string; to?: string }

type NavEntry = { to: string; label: string }

function navFor(role: string | undefined): NavEntry[] {
  const isMgr = !!role && ['manager', 'finance', 'admin'].includes(role)
  return [
    { to: '/', label: 'Workspace' },
    { to: '/quotations', label: 'Quotations' },
    ...(isMgr
      ? [
          { to: '/approvals', label: 'Approvals' },
          { to: '/fulfillment', label: 'Fulfillment' },
          { to: '/invoices', label: 'Invoices' },
          { to: '/subscriptions', label: 'Subscriptions' },
          { to: '/deal-health', label: 'Deal Health' },
          { to: '/reports', label: 'Reports' },
        ]
      : []),
    ...(role === 'admin' || role === 'manager' ? [{ to: '/admin', label: 'Config' }] : []),
  ]
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `whitespace-nowrap rounded px-2.5 py-1 text-sm transition-colors ${
          isActive ? 'bg-white/20 font-medium' : 'hover:bg-white/10'
        }`
      }
    >
      {children}
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
                      `rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-muted'
                      }`
                    }
                  >
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

          <Link to="/" className="shrink-0 font-semibold tracking-tight whitespace-nowrap">
            DealFlow360
          </Link>

          <nav className="hidden min-w-0 items-center gap-0.5 lg:flex">
            {entries.map((e) => (
              <NavItem key={e.to} to={e.to}>
                {e.label}
              </NavItem>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
            <Button
              size="sm"
              variant="ghost"
              className="hidden px-2 text-primary-foreground hover:bg-white/10 sm:inline-flex"
              onClick={reloadData}
              title="Refresh pricing, stock and approval data"
            >
              <RefreshCw className="size-4" />
              <span className="sr-only 2xl:not-sr-only">Reload Data</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="hidden px-2 text-primary-foreground hover:bg-white/10 sm:inline-flex"
              onClick={closeWorkspace}
              title="End the current working session view"
            >
              <PanelsTopLeft className="size-4" />
              <span className="sr-only 2xl:not-sr-only">Close Workspace</span>
            </Button>
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
