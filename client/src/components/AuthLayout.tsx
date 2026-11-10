import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Building2, Coins, ShieldCheck, TriangleAlert } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import StatusBadge from '@/components/StatusBadge'
import { money } from '@/lib/format'

// all true of the product today (landing-page rule: no claims we don't ship)
const POINTS = [
  { icon: ShieldCheck, text: 'Two-factor sign-in' },
  { icon: Building2, text: "Each company's data kept apart" },
  { icon: Coins, text: 'Quotes in your currency' },
]

const EXAMPLE_LINES: [string, number, number][] = [
  ['Analytics Suite — annual', 12, 1440],
  ['Onboarding package', 1, 2500],
  ['Priority support', 12, 300],
]

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-heading text-lg font-semibold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <BadgeCheck className="size-4" aria-hidden />
      </span>
      Dealwise
    </Link>
  )
}

/** A small, illustrative quote showing what the product does: a discount over the limit goes to approval. */
function ExampleQuote() {
  const total = EXAMPLE_LINES.reduce((s, [, q, p]) => s + q * p, 0)
  return (
    <figure aria-label="Example quotation" className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl shadow-black/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">QT-2026-0142</p>
          <p className="font-medium">Acme Corp</p>
        </div>
        <StatusBadge status="pending_approval" />
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {EXAMPLE_LINES.map(([name, qty, price]) => (
          <li key={name} className="flex justify-between gap-4">
            <span className="truncate text-muted-foreground">
              {name} <span className="text-xs">× {qty}</span>
            </span>
            <span className="tabular-nums">{money(qty * price)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t pt-3 text-sm">
        <span>Total after 18% discount</span>
        <span className="font-semibold tabular-nums">{money(total * 0.82)}</span>
      </div>
      <div className="mt-4 flex gap-2.5 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span>18% is above the Gold tier limit of 15%, so it went to a manager for approval.</span>
      </div>
      <figcaption className="mt-3 text-[11px] text-muted-foreground">Example quotation</figcaption>
    </figure>
  )
}

/**
 * Shared shell for the sign-in, sign-up, password and verify screens. Product
 * panel on the left from lg up; on a phone only the form shows.
 */
export default function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r bg-muted/50 p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
        {/* faint dot grid, fading out towards the bottom */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
          style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <Logo className="relative" />

        <div className="relative space-y-8">
          <div className="max-w-lg space-y-3">
            <p className="text-sm font-medium text-primary">Quote-to-cash for B2B sales teams</p>
            <h2 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
              Every quote priced right, approved fast and billed on time.
            </h2>
          </div>
          <ExampleQuote />
        </div>

        <ul className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between p-4 sm:px-8 sm:py-6">
          {/* the left panel carries the logo on wide screens */}
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-12">
          <div className="w-full max-w-[400px]">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            {/* roomier controls than the dense app screens */}
            <div className="mt-8 [&_[data-slot=button]]:h-10 [&_[data-slot=input]]:h-10 [&_[data-slot=select]]:h-10">{children}</div>
            {footer && <div className="mt-8">{footer}</div>}
          </div>
        </div>

        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-6 pb-6 text-center text-xs text-muted-foreground">
          <span>Customers review and confirm quotes through their own link — no account needed.</span>
          <span>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link> ·{' '}
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </span>
        </p>
      </main>
    </div>
  )
}
