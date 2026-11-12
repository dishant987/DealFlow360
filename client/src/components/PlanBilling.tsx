import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { humanize } from '@/lib/format'
import { usePlan } from '@/hooks/usePlan'
import Panel from '@/components/Panel'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Interval = 'month' | 'year'
type Payment = { id: string; number: string | null; date: string; amount: number; currency: string; status: string | null; description: string | null; url: string | null; pdf: string | null }

// what each plan unlocks; must match server/src/services/plan.ts and the landing page
export const OFFER = {
  starter: {
    name: 'Starter',
    blurb: 'Quote, approve and invoice.',
    points: ['Quotations with approval routing', 'Customer portal — no account needed', 'Customers, contacts and catalogue', 'One-time invoices with PDF', 'Team roles, two-factor and Google sign-in', 'Audit log'],
  },
  growth: {
    name: 'Growth',
    blurb: 'Stock, subscriptions and scale.',
    points: ['Everything in Starter', 'Multi-warehouse fulfilment and backorders', 'Subscriptions and recurring billing', 'Bulk import from CSV or Excel', 'Live upsell suggestions'],
  },
  scale: {
    name: 'Scale',
    blurb: 'Run the pipeline by the numbers.',
    points: ['Everything in Growth', 'Reports with PDF and Excel export', 'Deal health board — nudge and escalate', 'Discount anomaly alerts'],
  },
} as const
// Dealwise itself bills in USD, whatever currency the company quotes in
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)

/** Settings → Plan & billing (admins). Payment happens on Stripe's own pages. */
export default function PlanBilling() {
  const plan = usePlan()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const history = useQuery({
    queryKey: ['plan', 'history'],
    queryFn: async () => (await api.get('/plan/history')).data as { interval: Interval | null; cancelAtPeriodEnd: boolean; invoices: Payment[] },
  })
  const [picked, setPicked] = useState<Interval | null>(null)
  const interval: Interval = picked ?? history.data?.interval ?? 'month'

  // back from Stripe Checkout: confirm with Stripe straight away (the webhook also lands, for later changes)
  const checkout = params.get('checkout')
  const confirmed = useRef<string | null>(null) // once per session id (dev StrictMode runs effects twice)
  useEffect(() => {
    if (!checkout || confirmed.current === checkout) return
    confirmed.current = checkout
    params.delete('checkout')
    setParams(params, { replace: true })
    api
      .post('/plan/confirm', { sessionId: checkout })
      .then(({ data }) => {
        toast.success(data.active ? 'Thanks — your plan is active.' : 'Payment is still processing — this page will update shortly.')
        void qc.invalidateQueries({ queryKey: ['plan'] })
      })
      .catch((e) => toast.error(errText(e, "Couldn't confirm the payment")))
  }, [checkout, params, setParams, qc])

  // back from a one-task billing page (new card / cancel): Stripe sends us straight here
  const billing = params.get('billing')
  useEffect(() => {
    if (!billing) return
    params.delete('billing')
    setParams(params, { replace: true })
    toast.success(billing === 'canceled' ? 'Your plan is cancelled. You keep every feature until the end of this billing period.' : 'Card updated.', { id: 'billing' })
    void qc.invalidateQueries({ queryKey: ['plan'] })
  }, [billing, params, setParams, qc])

  const go = (data: { url?: string; switched?: boolean }) => {
    if (data.url) window.location.assign(data.url)
    else {
      toast.success('Plan changed.')
      void qc.invalidateQueries({ queryKey: ['plan'] })
    }
  }
  const choose = useMutation({
    mutationFn: async (p: 'starter' | 'growth' | 'scale') => (await api.post('/plan/checkout', { plan: p, interval })).data,
    onSuccess: go,
    onError: (e) => toast.error(errText(e, "Couldn't start checkout")),
  })
  const portal = useMutation({
    mutationFn: async (flow?: 'card' | 'cancel') => (await api.post('/plan/portal', { flow })).data,
    onSuccess: go,
    onError: (e) => toast.error(errText(e, "Couldn't open billing")),
  })
  const resume = useMutation({
    mutationFn: async () => (await api.post('/plan/resume')).data,
    onSuccess: () => {
      toast.success('Your plan will renew as usual.')
      void qc.invalidateQueries({ queryKey: ['plan'] })
    },
    onError: (e) => toast.error(errText(e, "Couldn't keep the plan")),
  })

  const p = plan.data
  if (!p) return <Skeleton className="h-64 w-full" />
  const current = p.plan === 'trial' ? 'Free trial' : OFFER[p.plan].name
  const ending = !!history.data?.cancelAtPeriodEnd

  return (
    <div className="space-y-6">
      <Panel
        title="Your plan"
        description={`${p.seats} ${p.seats === 1 ? 'user' : 'users'} — invited people count, blocked ones don't.`}
        action={
          p.hasSubscription && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => portal.mutate('card')} disabled={portal.isPending}>
                Update card
              </Button>
              {!history.data ? null : ending ? (
                <Button size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
                  Keep my plan
                </Button>
              ) : (
                p.subscriptionStatus !== 'canceled' && (
                  <Button size="sm" variant="outline" onClick={() => portal.mutate('cancel')} disabled={portal.isPending}>
                    Cancel plan
                  </Button>
                )
              )}
              <Button size="sm" variant="ghost" onClick={() => portal.mutate(undefined)} disabled={portal.isPending}>
                Billing details
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-2xl font-semibold">{current}</span>
          {p.readOnly ? (
            <StatusBadge status="rejected" label="Read-only" />
          ) : p.subscriptionStatus ? (
            <StatusBadge status={p.subscriptionStatus === 'active' ? 'approved' : 'pending_approval'} label={humanize(p.subscriptionStatus)} />
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {p.plan === 'trial'
            ? p.readOnly
              ? 'The trial has ended. Everyone can still sign in and look, but nothing can be created or changed until you choose a plan.'
              : `${p.trialDaysLeft} ${p.trialDaysLeft === 1 ? 'day' : 'days'} left, with every feature. No card needed until you choose.`
            : p.currentPeriodEnd
              ? `${ending ? 'Cancelled — ends' : 'Renews'} ${format(new Date(p.currentPeriodEnd), 'd MMM yyyy')}.`
              : ''}
        </p>
        {!p.billingReady && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Payments aren't switched on for this server yet, so plans can't be bought here.
          </p>
        )}
      </Panel>

      <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-lg border bg-background p-1 text-sm">
        {(['month', 'year'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setPicked(i)}
            className={`rounded-md px-3 py-1.5 ${interval === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {i === 'month' ? 'Monthly' : `Yearly · ${12 - p.annualMonths} months free`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['starter', 'growth', 'scale'] as const).map((id) => {
          const isCurrent = p.plan === id && !p.readOnly && (history.data?.interval ?? 'month') === interval
          const perPeriod = p.prices[id] * (interval === 'year' ? p.annualMonths : 1)
          return (
            <section key={id} className={`rounded-xl border bg-background p-5 ${id === 'growth' ? 'border-primary/40' : ''}`}>
              <h3 className="font-heading text-lg font-semibold">{OFFER[id].name}</h3>
              <p className="text-sm text-muted-foreground">{OFFER[id].blurb}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                <strong className="text-3xl text-foreground">{usd(interval === 'year' ? perPeriod / 12 : perPeriod)}</strong> per user / month
              </p>
              {interval === 'year' && <p className="text-xs text-muted-foreground">{usd(perPeriod)} per user, billed yearly</p>}
              <ul className="mt-4 space-y-2 text-sm">
                {OFFER[id].points.map((pt) => (
                  <li key={pt} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {pt}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                For your team of {p.seats}: <strong className="text-foreground">{usd(perPeriod * p.seats)}</strong> a {interval}
              </p>
              <Button
                className="mt-4 w-full"
                variant={id === 'growth' ? 'default' : 'outline'}
                disabled={isCurrent || !p.billingReady || choose.isPending}
                onClick={() => choose.mutate(id)}
              >
                {isCurrent ? 'Current plan' : p.hasSubscription && !p.readOnly ? `Switch to ${OFFER[id].name}` : `Choose ${OFFER[id].name}`}
              </Button>
            </section>
          )
        })}
      </div>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-5">
        <div>
          <h3 className="font-heading text-lg font-semibold">Enterprise</h3>
          <p className="text-sm text-muted-foreground">Everything in Scale, plus single sign-on and custom approval chains (planned), dedicated onboarding and priority support. Custom pricing.</p>
        </div>
        <Button variant="outline" asChild>
          <a href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL || 'privacy@dealwise.example'}?subject=Dealwise%20Enterprise`}>Talk to us</a>
        </Button>
      </section>
      <Panel title="Payment history" description="Every invoice Stripe has issued for your Dealwise plan.">
        {history.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !history.data?.invoices.length ? (
          <p className="text-sm text-muted-foreground">No payments yet. Invoices appear here once you choose a plan.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(i.date), 'd MMM yyyy')}</TableCell>
                    <TableCell className="font-mono text-xs">{i.number ?? '—'}</TableCell>
                    <TableCell className="hidden max-w-64 truncate text-muted-foreground sm:table-cell">{i.description ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: i.currency }).format(i.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={i.status === 'paid' ? 'approved' : i.status === 'open' ? 'pending_approval' : 'rejected'} label={humanize(i.status ?? 'draft')} />
                    </TableCell>
                    <TableCell className="space-x-3 text-right whitespace-nowrap">
                      {i.url && (
                        <a href={i.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                          View
                        </a>
                      )}
                      {i.pdf && (
                        <a href={i.pdf} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                          PDF
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        Prices in USD (whatever currency you quote in), billed {interval === 'year' ? 'yearly' : 'monthly'} by Stripe. Adding or removing people updates the seat count automatically.
      </p>
    </div>
  )
}
