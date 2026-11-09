import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Building2,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCcw,
  Search,
  Settings2,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import UserMenu from '@/components/UserMenu'
import ThemeToggle from '@/components/ThemeToggle'
import NotificationBell from '@/components/NotificationBell'
import CommandPalette, { type Command } from '@/components/CommandPalette'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export type Crumb = { label: string; to?: string }

type NavEntry = { to: string; label: string; icon: LucideIcon; badgeKey?: 'pendingApprovals' }
type NavGroup = { label: string; items: NavEntry[] }

// Grouped by job, not by table: what a person came to do decides where it sits.
function navFor(role: string | undefined): NavGroup[] {
  const staff = !!role && ['manager', 'finance', 'admin'].includes(role)
  const groups: NavGroup[] = [
    {
      label: 'Sell',
      items: [
        { to: '/', label: 'Workspace', icon: LayoutDashboard },
        { to: '/quotations', label: 'Quotations', icon: FileText },
        { to: '/customers', label: 'Customers', icon: Building2 },
        ...(staff
          ? [{ to: '/approvals', label: 'Approvals', icon: BadgeCheck, badgeKey: 'pendingApprovals' as const }]
          : []),
      ],
    },
  ]
  if (staff)
    groups.push(
      {
        label: 'Operate',
        items: [
          { to: '/fulfillment', label: 'Fulfillment', icon: Truck },
          { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCcw },
        ],
      },
      { label: 'Finance', items: [{ to: '/invoices', label: 'Invoices', icon: Receipt }] },
      {
        label: 'Insights',
        items: [
          { to: '/deal-health', label: 'Deal Health', icon: Activity },
          { to: '/reports', label: 'Reports', icon: BarChart3 },
        ],
      },
    )
  if (role === 'admin' || role === 'manager')
    groups.push({ label: 'Settings', items: [{ to: '/admin', label: 'Config', icon: Settings2 }] })
  return groups
}

// sidebar collapse is a per-device preference, like the theme
const COLLAPSE_KEY = 'sidebar-collapsed'
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <BadgeCheck className="size-4" aria-hidden />
      </span>
      {/* the wordmark stays the home link's name even when only the mark is drawn */}
      <span className={collapsed ? 'sr-only' : undefined}>Dealwise</span>
    </Link>
  )
}

function SideNav({
  groups,
  badgeFor,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[]
  badgeFor: (e: NavEntry) => number | undefined
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          {collapsed ? (
            <div className="mx-auto mb-1.5 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {g.label}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {g.items.map((e) => {
              const badge = badgeFor(e)
              return (
                <NavLink
                  key={e.to}
                  to={e.to}
                  end={e.to === '/'}
                  onClick={onNavigate}
                  title={collapsed ? e.label : undefined}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
                      collapsed ? 'justify-center' : 'px-3'
                    } ${
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" />
                      )}
                      <e.icon className={`size-4 shrink-0 ${isActive ? 'text-primary' : ''}`} aria-hidden />
                      <span className={collapsed ? 'sr-only' : 'flex-1'}>{e.label}</span>
                      {!!badge && badge > 0 && (
                        <span
                          className={`rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums ${
                            collapsed ? 'absolute top-0.5 right-1' : ''
                          }`}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const groups = navFor(user?.role)

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

  // pull fresh pricing / stock / approval data from the backend
  const reloadData = async () => {
    await qc.invalidateQueries()
    toast.success('Data reloaded from backend')
  }

  // end the current working session view (clears cached workspace data)
  const closeWorkspace = () => {
    qc.clear()
    nav('/')
  }

  const toggleCollapsed = () => {
    const next = !collapsed
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
    setCollapsed(next)
  }

  const commands: Command[] = [
    { id: 'new-quote', label: 'New quotation', group: 'Action', icon: FilePlus2, to: '/quotations', keywords: 'create quote' },
    ...groups.flatMap((g) => g.items.map((e) => ({ id: e.to, label: e.label, group: g.label, icon: e.icon, to: e.to }))),
    { id: 'profile', label: 'Your profile', group: 'Account', icon: UserRound, to: '/profile', keywords: 'password name' },
  ]

  return (
    <div className="min-h-svh bg-background">
      {/* desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex h-14 items-center border-b ${collapsed ? 'justify-center' : 'px-4'}`}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <SideNav groups={groups} badgeFor={badgeFor} collapsed={collapsed} />
        </div>
        <div
          className={`border-t p-2.5 ${
            collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center justify-between gap-2'
          }`}
        >
          {!collapsed && user && (
            <div className="min-w-0 px-1.5">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{roleLabel(user.role)}</div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
      </aside>

      <div className={`flex min-h-svh flex-col transition-[padding] duration-200 ${collapsed ? 'lg:pl-16' : 'lg:pl-60'}`}>
        {/* top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="-ml-2 lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
              <div className="flex h-14 items-center border-b px-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Logo />
              </div>
              <div className="flex-1 overflow-y-auto px-2.5 py-4">
                <SideNav groups={groups} badgeFor={badgeFor} onNavigate={() => setMenuOpen(false)} />
              </div>
              {user && (
                <div className="border-t px-4 py-3">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel(user.role)}</div>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="opacity-40">/</span>}
                {c.to && i < crumbs.length - 1 ? (
                  <Link to={c.to} className="truncate hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-foreground">{c.label}</span>
                )}
              </span>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
              aria-label="Search (Ctrl K)"
            >
              <Search className="size-3.5" aria-hidden />
              <span className="pr-6">Search…</span>
              <kbd className="rounded border bg-background px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search className="size-4" />
            </Button>
            <ThemeToggle />
            <NotificationBell />
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <UserMenu onReloadData={reloadData} onCloseWorkspace={closeWorkspace} />
          </div>
        </header>

        {actions && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b bg-background px-4 py-2 sm:px-6">
            {actions}
          </div>
        )}

        {user && user.emailVerified === false && <VerifyEmailBanner email={user.email} />}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

/** Soft reminder until the address is confirmed; nothing is locked meanwhile. */
function VerifyEmailBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const resend = async () => {
    setSending(true)
    try {
      await api.post('/auth/verify-email/resend')
      toast.success(`Sent — check ${email}.`)
    } catch {
      toast.error("Couldn't send the email. Try again in a minute.")
    } finally {
      setSending(false)
    }
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-accent px-4 py-2 text-sm sm:px-6">
      <span>
        Please confirm your email — we sent a link to <strong className="font-medium">{email}</strong>.
      </span>
      <Button size="sm" variant="link" className="h-auto p-0" onClick={resend} disabled={sending}>
        {sending ? 'Sending…' : 'Send it again'}
      </Button>
    </div>
  )
}
