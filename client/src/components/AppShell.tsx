import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export type Crumb = { label: string; to?: string }

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `px-2.5 py-1 rounded text-sm transition-colors ${
          isActive ? 'bg-white/20' : 'hover:bg-white/10'
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
  const isMgr = !!user && ['manager', 'finance', 'admin'].includes(user.role)

  const logout = async () => {
    await api.post('/auth/logout')
    await qc.invalidateQueries({ queryKey: ['me'] })
    nav('/login')
  }

  return (
    <div className="min-h-svh bg-muted/20">
      {/* Odoo-style purple top bar with primary nav */}
      <header className="bg-primary text-primary-foreground">
        <div className="px-6 py-2.5 flex items-center gap-4">
          <Link to="/" className="font-semibold tracking-tight">
            DealFlow360
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavItem to="/">Workspace</NavItem>
            <NavItem to="/quotations">Quotations</NavItem>
            {isMgr && (
              <>
                <NavItem to="/approvals">Approvals</NavItem>
                <NavItem to="/deal-health">Deal Health</NavItem>
                <NavItem to="/reports">Reports</NavItem>
              </>
            )}
            {(user?.role === 'admin' || user?.role === 'manager') && (
              <NavItem to="/admin">Config</NavItem>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden sm:inline opacity-90">
              {user?.name} · <span className="uppercase opacity-70">{user?.role}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* breadcrumb bar */}
      <div className="border-b bg-background px-6 py-2 flex items-center justify-between min-h-[41px]">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="opacity-40">/</span>}
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <main className="p-6">{children}</main>
    </div>
  )
}
