import { describe, expect, it } from 'vitest'
import { accountState, fromStripeSubscription } from './plan.js'

const now = new Date('2026-11-10T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)

describe('plan rules', () => {
  it('a trial has every feature and counts down, then turns read-only', () => {
    expect(accountState({ plan: 'trial', trialEndsAt: days(14), subscriptionStatus: null }, now)).toEqual({
      plan: 'trial',
      trialDaysLeft: 14,
      readOnly: false,
      features: ['fulfilment', 'subscriptions', 'import', 'upsell', 'reports', 'dealHealth'],
    })
    expect(accountState({ plan: 'trial', trialEndsAt: days(0.5), subscriptionStatus: null }, now).trialDaysLeft).toBe(1)
    const over = accountState({ plan: 'trial', trialEndsAt: days(-1), subscriptionStatus: null }, now)
    expect(over).toMatchObject({ trialDaysLeft: 0, readOnly: true })
  })

  it('a paid plan follows Stripe: active and past_due work, canceled is read-only', () => {
    const starter = (s: string) => accountState({ plan: 'starter', trialEndsAt: days(-30), subscriptionStatus: s }, now)
    expect(starter('active')).toEqual({ plan: 'starter', trialDaysLeft: null, readOnly: false, features: [] })
    expect(starter('past_due').readOnly).toBe(false)
    expect(starter('canceled').readOnly).toBe(true)
    expect(starter('unpaid').readOnly).toBe(true)
    expect(accountState({ plan: 'growth', trialEndsAt: days(-30), subscriptionStatus: 'active' }, now).features).toEqual(['fulfilment', 'subscriptions', 'import', 'upsell'])
    expect(accountState({ plan: 'scale', trialEndsAt: days(-30), subscriptionStatus: 'active' }, now).features).toContain('reports')
  })

  it('a plan with no subscription yet is still judged by its trial', () => {
    expect(accountState({ plan: 'growth', trialEndsAt: days(3), subscriptionStatus: null }, now)).toMatchObject({ plan: 'trial', trialDaysLeft: 3 })
  })

  it('reads plan, status and period end from a Stripe subscription', () => {
    const end = 1_800_000_000
    expect(fromStripeSubscription({ status: 'active', metadata: { plan: 'growth' }, items: { data: [{ current_period_end: end }] } })).toEqual({
      plan: 'growth',
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(end * 1000),
    })
    // older API shape, unknown plan in metadata is ignored
    expect(fromStripeSubscription({ status: 'canceled', metadata: { plan: 'nope' }, current_period_end: end })).toEqual({
      subscriptionStatus: 'canceled',
      currentPeriodEnd: new Date(end * 1000),
    })
  })
})
