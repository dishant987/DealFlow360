import { useState, type ReactNode } from 'react'
import type { LucideIcon as Icon } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  Check,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Lock,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Workflow,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ThemeToggle from '@/components/ThemeToggle'

/*
 * Public marketing site for signed-out visitors. Copy describes what ships today;
 * roadmap items carry "Coming soon". No invented customers, logos, quotes or
 * metrics — every number on this page is an example inside a product sketch.
 */

// ---------------------------------------------------------------- primitives

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <BadgeCheck className="size-4.5" aria-hidden />
      </span>
      {/* very narrow phones need the room for the header buttons */}
      <span className={compact ? 'max-[400px]:sr-only' : undefined}>Dealwise</span>
    </Link>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{children}</p>
  )
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-3 text-muted-foreground text-pretty">{body}</p>}
    </div>
  )
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const tones = {
    ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    bad: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    info: 'bg-accent text-accent-foreground',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Window chrome around a product sketch. */
function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-foreground/5 ring-1 ring-foreground/5 ${className}`}
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="ml-3 truncate rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">
          app.dealwise.app
        </span>
      </div>
      {children}
    </div>
  )
}

// ------------------------------------------------------------ product sketches

const SIDENAV: [Icon, string][] = [
  [LayoutDashboard, 'Workspace'],
  [FileText, 'Quotations'],
  [ShieldCheck, 'Approvals'],
  [Truck, 'Fulfilment'],
  [Receipt, 'Invoices'],
  [Gauge, 'Deal health'],
]

const PIPELINE = [
  { stage: 'Draft', cards: [['Orion Ltd', '$4,180'], ['Helix Systems', '$920']] },
  { stage: 'Approval', cards: [['Acme Corp', '$10,240'], ['Vertex Mfg', '$22,600']] },
  { stage: 'Sent', cards: [['Nova Retail', '$7,450']] },
  { stage: 'Confirmed', cards: [['Beta Industries', '$3,310'], ['Zenith Co', '$12,800']] },
]

function HeroSketch() {
  return (
    <Frame>
      <div className="grid grid-cols-[150px_1fr] text-xs max-md:grid-cols-1">
        <aside className="space-y-0.5 border-r bg-muted/40 p-3 max-md:hidden">
          {SIDENAV.map(([I, label], i) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                i === 1 ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <I className="size-3.5" /> {label}
            </div>
          ))}
        </aside>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-heading text-sm font-semibold">Pipeline</div>
            <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
              + New quotation
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['Open pipeline', '$61,500'],
              ['Awaiting approval', '2'],
              ['Win rate (90d)', '42%'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-background p-2.5">
                <div className="text-[10px] text-muted-foreground">{k}</div>
                <div className="mt-0.5 text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
            {PIPELINE.map((col) => (
              <div key={col.stage} className="rounded-lg bg-muted/50 p-2">
                <div className="mb-1.5 text-[10px] font-medium text-muted-foreground uppercase">{col.stage}</div>
                <div className="space-y-1.5">
                  {col.cards.map(([c, v]) => (
                    <div key={c} className="rounded-md border bg-card p-2">
                      <div className="truncate font-medium">{c}</div>
                      <div className="text-muted-foreground">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  )
}

function FloatCard({ icon: I, title, body, className }: { icon: Icon; title: string; body: string; className: string }) {
  return (
    <div
      aria-hidden
      className={`absolute hidden w-64 items-start gap-3 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur lg:flex ${className}`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
        <I className="size-4" />
      </span>
      <div className="text-xs">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-muted-foreground">{body}</div>
      </div>
    </div>
  )
}

function QuoteSketch() {
  const lines = [
    ['Business Laptop × 10', '12%', '15%', null],
    ['Setup Service × 1', '18%', '10%', '+8'],
    ['Support Plan × 10 / mo', '5%', '15%', null],
  ] as const
  return (
    <Frame>
      <div className="p-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-muted-foreground">QT-2026-1042 · Acme Corp · Gold tier</div>
            <div className="font-heading text-sm font-semibold">Quotation builder</div>
          </div>
          <Pill tone="warn">Routes to Sales Manager</Pill>
        </div>
        <table className="mt-3 w-full text-left">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 font-normal">Line</th>
              <th className="py-1.5 font-normal">Discount</th>
              <th className="py-1.5 font-normal">Limit</th>
              <th className="py-1.5 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([l, d, lim, over]) => (
              <tr key={l} className="border-b last:border-0">
                <td className="py-2">{l}</td>
                <td className="py-2">{d}</td>
                <td className="py-2 text-muted-foreground">{lim}</td>
                <td className="py-2 text-right">
                  {over ? <Pill tone="bad">Over {over}pt</Pill> : <Pill tone="ok">Within</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed bg-accent/40 p-2.5">
          <Sparkles className="size-3.5 text-primary" />
          <span>
            Suggested: <b>Docking Station</b> — adds <b>+1.8pt</b> margin
          </span>
        </div>
      </div>
    </Frame>
  )
}

function ApprovalSketch() {
  return (
    <Frame>
      <div className="space-y-3 p-4 text-xs">
        <div className="font-heading text-sm font-semibold">Approval chain · QT-2026-1042</div>
        {[
          ['Blended risk score', '8.0 — above manager limit (5)', 'warn'],
          ['Step 1 · Sales Manager', 'Approved by Manoj · "Strategic account"', 'ok'],
          ['Step 2 · Finance', 'Waiting — any finance user can take it', 'info'],
        ].map(([k, v, t]) => (
          <div key={k} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="font-medium">{k}</div>
              <div className="text-muted-foreground">{v}</div>
            </div>
            <Pill tone={t as 'ok' | 'warn' | 'info'}>{t === 'ok' ? 'Done' : t === 'warn' ? 'Flagged' : 'Pending'}</Pill>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function FulfilSketch() {
  return (
    <Frame>
      <div className="space-y-2 p-4 text-xs">
        <div className="font-heading text-sm font-semibold">Suggested split · Business Laptop × 10</div>
        {[
          ['Main Warehouse', 8, 'cheapest site'],
          ['East Depot', 2, 'fills the rest'],
          ['Backorder', 0, 'nothing short'],
        ].map(([w, n, note]) => (
          <div key={w as string} className="flex items-center gap-3 rounded-lg border p-2.5">
            <Boxes className="size-4 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{w}</div>
              <div className="text-muted-foreground">{note}</div>
            </div>
            <div className="w-24 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(Number(n) / 10) * 100}%` }} />
            </div>
            <span className="w-6 text-right font-semibold">{n}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function BillingSketch() {
  return (
    <Frame>
      <div className="grid gap-3 p-4 text-xs sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground">One-time invoice</div>
          <div className="mt-1 text-lg font-semibold">$9,500.00</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground">Paid $5,000</span>
            <Pill tone="warn">Partially paid</Pill>
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground">Recurring · Support Plan</div>
          <div className="mt-1 text-lg font-semibold">
            $500.00<span className="text-xs font-normal text-muted-foreground"> / month</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground">Next bill 1 Dec</span>
            <Pill tone="ok">Active</Pill>
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 sm:col-span-2">
          Cancel mid-cycle → a prorated credit note is raised automatically.
        </div>
      </div>
    </Frame>
  )
}

function PortalSketch() {
  return (
    <Frame>
      <div className="space-y-3 p-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="font-heading text-sm font-semibold">Your quotation from Dealwise Demo Co.</div>
          <Pill tone="info">No login needed</Pill>
        </div>
        <div className="rounded-lg border p-3">
          <div className="font-medium">Setup Service</div>
          <div className="mt-1 rounded-md bg-muted/60 p-2 text-muted-foreground">
            “Can this be scheduled for the week of the 14th?”
          </div>
        </div>
        <div className="flex gap-2">
          <span className="rounded-md border px-3 py-1.5">Counter discount</span>
          <span className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">Confirm order</span>
        </div>
      </div>
    </Frame>
  )
}

// ------------------------------------------------------------------- content

const STAGES: { id: string; label: string; title: string; body: string; points: string[]; sketch: ReactNode }[] = [
  {
    id: 'quote',
    label: 'Quote',
    title: 'Build quotes that price themselves',
    body: 'Customer tier prices apply on their own. Margin, discount limits and risk update on every keystroke, so reps know before they submit.',
    points: ['Tier price lists and product variants', 'Per-line and order-level discounts', 'Upsell suggestions with margin impact'],
    sketch: <QuoteSketch />,
  },
  {
    id: 'approve',
    label: 'Approve',
    title: 'Approvals that route themselves',
    body: 'Each line is measured against its own limit and the overages are added up. Low risk is approved on submit; higher risk goes to a manager, then finance.',
    points: ['Configurable thresholds and ceilings', 'Reason required to reject or return', 'Full audit trail of every decision'],
    sketch: <ApprovalSketch />,
  },
  {
    id: 'fulfil',
    label: 'Fulfil',
    title: 'Ship from the right warehouse',
    body: 'Dealwise picks the cheapest site that can fill a line, splits only when it has to, and turns any shortfall into a backorder you can consolidate later.',
    points: ['Multi-warehouse stock and reorder rules', 'Manual override that never invents stock', 'Backorder tracking and consolidation'],
    sketch: <FulfilSketch />,
  },
  {
    id: 'bill',
    label: 'Bill',
    title: 'One order, one-time and recurring billing',
    body: 'Hardware is invoiced once and subscriptions get their own schedule. Proration uses the real calendar, and partial payments keep the invoice open.',
    points: ['Pause, resume and cancel subscriptions', 'Automatic prorated credit notes', 'Invoice PDFs and payment tracking'],
    sketch: <BillingSketch />,
  },
  {
    id: 'portal',
    label: 'Portal',
    title: 'Let customers negotiate in one place',
    body: 'Send a private link instead of a PDF. Customers comment on lines, counter the discount and confirm — and your costs and margins never reach them.',
    points: ['No customer account required', 'Counter-offers re-enter approval automatically', 'One-click confirmation'],
    sketch: <PortalSketch />,
  },
]

const BENTO: { icon: Icon; title: string; body: string; soon?: boolean; wide?: boolean }[] = [
  {
    icon: Gauge,
    title: 'Deal health board',
    body: 'Stalled deals, discounts far above a rep’s own average and slipping deliveries — on one board, with nudge and escalate built in.',
    wide: true,
  },
  { icon: Bell, title: 'Live updates', body: 'Every screen refreshes the moment a teammate makes a change.' },
  { icon: ScrollText, title: 'Audit log', body: 'Who did what, when and why — for every quote, approval and payment.' },
  { icon: FileSpreadsheet, title: 'Reports & exports', body: 'Filter by rep, customer, category or date and export to PDF or Excel.' },
  { icon: Users, title: 'Roles that fit', body: 'Reps, managers, finance and admins each see exactly what they need.' },
  {
    icon: Workflow,
    title: 'Automations',
    body: '“When this happens, do that” — remind a rep about a stalled deal, send approved quotes, alert finance on large orders.',
    soon: true,
  },
  {
    icon: FileSpreadsheet,
    title: 'Bulk import',
    body: 'Bring customers and products in from CSV or Excel in one go, with every row checked before anything is saved.',
  },
]

const COMPARE: [string, string][] = [
  ['Discounts approved over email and chat', 'Limits enforced on every line, approvals routed automatically'],
  ['Stock checked by phone before promising dates', 'Live stock across warehouses, split suggested for you'],
  ['Subscriptions billed in a separate tool', 'One-time and recurring billing on the same order'],
  ['Quotes sent as PDFs and negotiated by email', 'A private portal link the customer confirms in one click'],
  ['Stalled deals noticed after they are lost', 'Stalled and unusual deals flagged on a health board'],
]

const SECURITY: [Icon, string, string][] = [
  [Lock, 'Secure sessions', 'httpOnly cookies, HTTPS-only in production, rate-limited sign-in.'],
  [KeyRound, 'Hashed passwords', 'bcrypt hashing and single-use, time-limited reset links.'],
  [ScrollText, 'Complete audit trail', 'Every change recorded with user, time and reason.'],
  [ShieldCheck, 'Least privilege', 'Role-based access; customers never see cost or margin.'],
]

// must match server/src/services/plan.ts (USD per user / month, ANNUAL_MONTHS, and what each plan adds)
const ANNUAL_MONTHS = 10
const PLANS: { name: string; price: number | null; blurb: string; points: string[]; featured?: boolean }[] = [
  {
    name: 'Starter',
    price: 15,
    blurb: 'Quote, approve and invoice.',
    points: ['Quotations with approval routing', 'Customer portal — no account needed', 'Customers, contacts and catalogue', 'One-time invoices with PDF', 'Team roles, two-factor and Google sign-in', 'Audit log'],
  },
  {
    name: 'Growth',
    price: 39,
    blurb: 'Stock, subscriptions and scale.',
    points: ['Everything in Starter', 'Multi-warehouse fulfilment and backorders', 'Subscriptions and recurring billing', 'Bulk import from CSV or Excel', 'Live upsell suggestions'],
    featured: true,
  },
  {
    name: 'Scale',
    price: 69,
    blurb: 'Run the pipeline by the numbers.',
    points: ['Everything in Growth', 'Reports with PDF and Excel export', 'Deal health board — nudge and escalate', 'Discount anomaly alerts'],
  },
  {
    name: 'Enterprise',
    price: null,
    blurb: 'For larger organisations with custom needs.',
    points: ['Everything in Scale', 'Single sign-on (planned)', 'Custom approval chains (planned)', 'Dedicated onboarding and priority support'],
  },
]

const FAQ = [
  {
    q: 'Does my customer need an account?',
    a: 'No. They get a private link to their quote. They can comment, counter and confirm without signing up, and they never see your costs or margins.',
  },
  {
    q: 'Who decides what needs approval?',
    a: 'Your managers set discount limits per customer tier and per product category, plus two thresholds for the approval chain. Dealwise applies them on every submit.',
  },
  {
    q: 'Can I sell subscriptions and hardware on one order?',
    a: 'Yes. One-time items are invoiced once and each subscription gets its own recurring schedule, with proration, pause and cancellation handled for you.',
  },
  {
    q: 'Can I bring my existing customers and products?',
    a: 'Yes. On Growth and Scale, upload a CSV or Excel file of customers or products; every row is checked and you see what will be added before anything is saved.',
  },
  {
    q: 'Is there a dark mode?',
    a: 'Yes — use the moon icon in the top bar. Dealwise remembers your choice on each device.',
  },
]

const FOOTER: [string, [string, string][]][] = [
  ['Product', [['Features', '#features'], ['How it works', '#workflow'], ['Pricing', '#pricing'], ['FAQ', '#faq']]],
  ['Get started', [['Create a workspace', '/signup'], ['Sign in', '/login'], ['Reset password', '/forgot-password']]],
  ['Legal', [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']]],
]

// ---------------------------------------------------------------------- page

export default function Landing() {
  const [yearly, setYearly] = useState(false)
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
          <Wordmark compact />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Sections">
            <a href="#workflow" className="transition-colors hover:text-foreground">Product</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#security" className="transition-colors hover:text-foreground">Security</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle className="max-[340px]:hidden" />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(50rem 28rem at 50% -8%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
            style={{
              backgroundImage:
                'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
            }}
          />
          <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center md:pt-24">
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            >
              <Pill tone="info">New</Pill>
              Light and dark mode, plus a faster app
              <ArrowRight className="size-3" aria-hidden />
            </a>
            <h1 className="mx-auto mt-6 max-w-4xl font-heading text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              Quote to cash, <span className="text-primary italic">on autopilot.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
              Dealwise is the sales operations workspace for B2B teams. Pricing rules enforce
              themselves, approvals route themselves, and every order flows from quote to invoice —
              without spreadsheets or email chains.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="h-11 px-6">
                <Link to="/signup">
                  Start free trial <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6">
                <a href="#workflow">Take the tour</a>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">14-day free trial · No credit card · Set up in minutes</p>
          </div>

          <div className="relative mx-auto max-w-5xl px-4 pb-20">
            <HeroSketch />
            <FloatCard
              icon={ShieldCheck}
              title="Approved automatically"
              body="QT-2026-1051 was within every limit."
              className="-left-10 bottom-8"
            />
            <FloatCard
              icon={CircleDollarSign}
              title="Payment recorded"
              body="INV-2026-0318 is now settled."
              className="-right-10 -top-6"
            />
          </div>
        </section>

        {/* ------------------------------------------------------ workflow tabs */}
        <section id="workflow" className="scroll-mt-16 border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
            <SectionHead
              eyebrow="One workflow"
              title="From first quote to final payment"
              body="Five stages, one record. Nothing gets copied between tools and nothing falls through the cracks."
            />
            <Tabs defaultValue="quote" className="mt-10">
              <TabsList className="mx-auto flex h-auto w-fit flex-wrap justify-center">
                {STAGES.map((s, i) => (
                  <TabsTrigger key={s.id} value={s.id} className="px-4">
                    <span className="mr-1.5 text-muted-foreground">{i + 1}</span>
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {STAGES.map((s) => (
                <TabsContent key={s.id} value={s.id} className="mt-10">
                  <div className="grid items-center gap-10 md:grid-cols-2">
                    <div>
                      <h3 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
                      <p className="mt-3 text-muted-foreground">{s.body}</p>
                      <ul className="mt-6 space-y-2.5 text-sm">
                        {s.points.map((p) => (
                          <li key={p} className="flex gap-2.5">
                            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                              <Check className="size-3" aria-hidden />
                            </span>
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {s.sketch}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        {/* --------------------------------------------------------- bento grid */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
            <SectionHead
              eyebrow="Built in"
              title="Everything around the deal, too"
              body="The pieces teams usually bolt on later come included."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BENTO.map((f) => (
                <article
                  key={f.title}
                  className={`group relative rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg ${
                    f.wide ? 'lg:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <f.icon className="size-5" aria-hidden />
                    </span>
                    {f.soon && (
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 font-heading text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- before / after */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-20 md:py-24">
            <SectionHead eyebrow="Why teams switch" title="Less chasing. More closing." />
            <div className="mt-12 overflow-hidden rounded-2xl border bg-card">
              <div className="grid grid-cols-2 border-b bg-muted/50 text-sm font-medium">
                <div className="p-4 text-muted-foreground">Without Dealwise</div>
                <div className="border-l p-4 text-primary">With Dealwise</div>
              </div>
              {COMPARE.map(([before, after]) => (
                <div key={before} className="grid grid-cols-2 border-b text-sm last:border-0">
                  <div className="flex gap-2.5 p-4 text-muted-foreground">
                    <X className="mt-0.5 size-4 shrink-0 text-destructive/70" aria-hidden />
                    {before}
                  </div>
                  <div className="flex gap-2.5 border-l p-4">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {after}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- security */}
        <section id="security" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
            <SectionHead
              eyebrow="Security"
              title="Your pricing is your business"
              body="Costs and margins stay inside your team. Everything else is locked down by default."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SECURITY.map(([I, t, b]) => (
                <div key={t} className="rounded-2xl border p-6">
                  <I className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-4 font-medium">{t}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- pricing */}
        <section id="pricing" className="scroll-mt-16 border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
            <SectionHead eyebrow="Pricing" title="Simple per-user pricing" body="Every new workspace starts with a 14-day free trial of every feature — no card needed. Change plans any time." />
            <div role="radiogroup" aria-label="Billing period" className="mx-auto mt-10 flex w-fit rounded-full border bg-card p-1 text-sm">
              {[false, true].map((y) => (
                <button
                  key={String(y)}
                  type="button"
                  role="radio"
                  aria-checked={yearly === y}
                  onClick={() => setYearly(y)}
                  className={`rounded-full px-4 py-1.5 ${yearly === y ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {y ? `Yearly · ${12 - ANNUAL_MONTHS} months free` : 'Monthly'}
                </button>
              ))}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((p) => (
                <div
                  key={p.name}
                  className={`relative flex flex-col rounded-2xl border bg-card p-7 ${
                    p.featured ? 'border-primary shadow-xl shadow-primary/10 ring-1 ring-primary' : ''
                  }`}
                >
                  {p.featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-heading text-4xl font-semibold">
                      {p.price === null ? 'Custom' : `$${yearly ? ((p.price * ANNUAL_MONTHS) / 12).toFixed(2).replace(/\.00$/, '') : p.price}`}
                    </span>
                    <span className="text-sm text-muted-foreground">{p.price === null ? 'talk to us' : 'per user / month'}</span>
                  </div>
                  {p.price !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {yearly ? `$${p.price * ANNUAL_MONTHS} per user, billed yearly` : `$${p.price * 12} per user a year, billed monthly`}
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-7" variant={p.featured ? 'default' : 'outline'}>
                    {p.name === 'Enterprise' ? (
                      <a href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL || 'privacy@dealwise.example'}?subject=Dealwise%20Enterprise`}>Talk to us</a>
                    ) : (
                      <Link to="/signup">Start with {p.name}</Link>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- faq */}
        <section id="faq" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1fr_1.6fr] md:py-24">
            <div>
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered</h2>
              <p className="mt-3 text-muted-foreground">
                Can't find what you need? Create a free workspace and look around — it takes a minute.
              </p>
            </div>
            <div className="divide-y rounded-2xl border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- final cta */}
        <section className="px-4 pb-20">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground md:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  'radial-gradient(40rem 20rem at 20% 0%, rgba(255,255,255,0.25), transparent 60%), radial-gradient(30rem 20rem at 90% 100%, rgba(0,0,0,0.25), transparent 60%)',
              }}
            />
            <div className="relative">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                Close your next deal with Dealwise
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
                Set up your workspace in minutes. Invite your team when you're ready.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" variant="secondary" className="h-11 px-6">
                  <Link to="/signup">
                    Create your workspace <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-11 px-6 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Sales operations for B2B teams — quotes, approvals, fulfilment and billing in one workspace.
            </p>
          </div>
          {FOOTER.map(([heading, links]) => (
            <div key={heading}>
              <div className="text-sm font-medium">{heading}</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('#') ? (
                      <a href={href} className="hover:text-foreground">{label}</a>
                    ) : (
                      <Link to={href} className="hover:text-foreground">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} Dealwise. All rights reserved.</span>
            <span>Made for teams who sell to businesses.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
