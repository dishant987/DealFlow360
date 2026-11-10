// Dealwise's own plans (step 17). Pure: callers pass the company row and the clock.

export type PlanId = 'trial' | 'starter' | 'growth' | 'scale'
export type Feature = 'fulfilment' | 'subscriptions' | 'import' | 'upsell' | 'reports' | 'dealHealth'

const GROWTH: Feature[] = ['fulfilment', 'subscriptions', 'import', 'upsell']
const SCALE: Feature[] = [...GROWTH, 'reports', 'dealHealth']

/**
 * Per user per month, in USD cents. Each plan includes the one before it. Shown on the
 * landing page and Settings → Plan & billing, and sent to Stripe Checkout.
 * Starter: quotes, approvals, portal, customers, catalogue, one-time invoices, team, audit log.
 */
export const PLANS = {
  starter: { name: 'Starter', perSeatCents: 1500, features: [] as Feature[] },
  growth: { name: 'Growth', perSeatCents: 3900, features: GROWTH },
  scale: { name: 'Scale', perSeatCents: 6900, features: SCALE },
} as const
export type PaidPlan = keyof typeof PLANS
export const isPaidPlan = (p: string): p is PaidPlan => p in PLANS

// Stripe statuses that keep the workspace usable; past_due is Stripe's grace period while it retries the card
const LIVE = ['active', 'trialing', 'past_due']

type Org = { plan: string; trialEndsAt: Date; subscriptionStatus: string | null }

export function accountState(org: Org, now = new Date()) {
  if (isPaidPlan(org.plan) && org.subscriptionStatus) {
    return {
      plan: org.plan as PlanId,
      trialDaysLeft: null,
      readOnly: !LIVE.includes(org.subscriptionStatus),
      features: [...PLANS[org.plan].features],
    }
  }
  // the trial has everything (Scale), so people see the whole product before paying
  const msLeft = org.trialEndsAt.getTime() - now.getTime()
  return {
    plan: 'trial' as PlanId,
    trialDaysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
    readOnly: msLeft <= 0,
    features: [...PLANS.scale.features],
  }
}

/** What to store from a Stripe subscription (works with old and new API shapes of the period end). */
export function fromStripeSubscription(sub: {
  status: string
  metadata?: Record<string, string> | null
  current_period_end?: number | null
  items?: { data: { current_period_end?: number | null }[] }
}) {
  const plan = sub.metadata?.plan
  const end = sub.items?.data[0]?.current_period_end ?? sub.current_period_end
  return {
    ...(plan && isPaidPlan(plan) ? { plan } : {}),
    subscriptionStatus: sub.status,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  }
}
