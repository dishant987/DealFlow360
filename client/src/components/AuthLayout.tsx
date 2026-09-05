import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const PITCH = [
  'Discount governance that routes its own approvals',
  'Live upsell suggestions with real margin impact',
  'Multi-warehouse splitting with backorder recovery',
  'One-time and recurring billing on a single order',
]

/**
 * Shared shell for the four unauthenticated screens. Brand panel on the left at
 * lg and up; below that it collapses to a compact wordmark so the form stays the
 * focus on a phone.
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
    <div className="min-h-svh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        {/* soft light source, keeps the flat purple from reading as a solid block */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(70rem 40rem at 15% 0%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(50rem 40rem at 90% 100%, rgba(0,0,0,0.28), transparent 60%)',
          }}
        />
        <div className="relative">
          <Link to="/login" className="text-2xl font-semibold tracking-tight">
            DealFlow360
          </Link>
          <p className="mt-1 text-sm text-primary-foreground/70">
            Quotation to cash, self-governing
          </p>
        </div>

        <div className="relative max-w-md space-y-6">
          <h2 className="font-heading text-3xl leading-tight font-medium text-balance">
            The deal engine that enforces its own pricing discipline.
          </h2>
          <ul className="space-y-3">
            {PITCH.map((line) => (
              <li key={line} className="flex items-start gap-3 text-sm text-primary-foreground/85">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary-foreground/60"
                />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/55">
          Customers negotiate through their own portal link — no account required.
        </p>
      </aside>

      <main className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4 py-10 lg:min-h-0">
        <div className="w-full max-w-sm space-y-5">
          {/* compact brand — only shown when the panel above is hidden */}
          <div className="text-center lg:hidden">
            <span className="font-heading text-xl font-semibold text-primary">DealFlow360</span>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>

          {footer}
        </div>
      </main>
    </div>
  )
}
