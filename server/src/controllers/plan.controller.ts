import type { Request, Response } from 'express'
import Stripe from 'stripe'
import { z } from 'zod'
import { and, count, eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { organizations, users } from '../models/schema.js'
import { PLANS, fromStripeSubscription } from '../services/plan.js'

const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')
// billing is off until the key is set; everything else works without it
const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null)
const NOT_SET_UP = "Billing isn't set up on this server yet. Ask whoever runs Dealwise to add the Stripe keys."

// users aren't under RLS: count this company's seats explicitly (invited people count, blocked don't)
const seatsUsed = async (orgId: string) =>
  (await db.select({ n: count() }).from(users).where(and(eq(users.organizationId, orgId), eq(users.blocked, false))))[0].n

const orgRow = async (orgId: string) => (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0]

const priceData = (plan: keyof typeof PLANS) => ({
  currency: 'usd',
  unit_amount: PLANS[plan].perSeatCents,
  recurring: { interval: 'month' as const },
  product_data: { name: `Dealwise ${PLANS[plan].name}` },
})

/** Plan, trial and seats — every signed-in user reads it (for the trial banner). */
export async function getPlan(req: Request, res: Response) {
  const org = await orgRow(req.orgId!)
  res.json({
    ...req.account,
    subscriptionStatus: org.subscriptionStatus,
    currentPeriodEnd: org.currentPeriodEnd,
    hasSubscription: !!org.stripeSubscriptionId,
    seats: await seatsUsed(req.orgId!),
    prices: { starter: PLANS.starter.perSeatCents / 100, growth: PLANS.growth.perSeatCents / 100, scale: PLANS.scale.perSeatCents / 100 },
    billingReady: !!process.env.STRIPE_SECRET_KEY,
  })
}

/** Start paying (Stripe Checkout), or switch an existing subscription to the other plan. */
export async function choosePlan(req: Request, res: Response) {
  const p = z.object({ plan: z.enum(['starter', 'growth', 'scale']) }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Pick Starter, Growth or Scale.' })
  const s = stripe()
  if (!s) return res.status(503).json({ error: NOT_SET_UP })
  const org = await orgRow(req.orgId!)
  const plan = p.data.plan

  if (org.stripeSubscriptionId && org.subscriptionStatus !== 'canceled') {
    const sub = await s.subscriptions.retrieve(org.stripeSubscriptionId)
    const updated = await s.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price_data: { currency: 'usd', unit_amount: PLANS[plan].perSeatCents, recurring: { interval: 'month' }, product: await productFor(s, plan) } }],
      metadata: { orgId: org.id, plan },
      proration_behavior: 'create_prorations',
    })
    await db.update(organizations).set(fromStripeSubscription(updated)).where(eq(organizations.id, org.id))
    return res.json({ switched: true })
  }

  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.id))
  const customer =
    org.stripeCustomerId ??
    (await s.customers.create({ name: org.name, email: me?.email, metadata: { orgId: org.id } })).id
  if (!org.stripeCustomerId) await db.update(organizations).set({ stripeCustomerId: customer }).where(eq(organizations.id, org.id))

  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: org.id,
    line_items: [{ price_data: priceData(plan), quantity: await seatsUsed(org.id) }],
    subscription_data: { metadata: { orgId: org.id, plan } },
    success_url: `${CLIENT_URL}/admin?section=billing&checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${CLIENT_URL}/admin?section=billing`,
  })
  res.json({ url: session.url })
}

// subscription items need a product id (price_data on an item can't create one inline)
async function productFor(s: Stripe, plan: keyof typeof PLANS) {
  const name = `Dealwise ${PLANS[plan].name}`
  const found = await s.products.search({ query: `name:"${name}" AND active:"true"` })
  return found.data[0]?.id ?? (await s.products.create({ name })).id
}

/**
 * Back from Checkout: ask Stripe about this session and activate at once, so the plan
 * doesn't wait for (or depend on) the webhook. Only a session started for this company counts.
 */
export async function confirmCheckout(req: Request, res: Response) {
  const p = z.object({ sessionId: z.string().startsWith('cs_') }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Unknown checkout.' })
  const s = stripe()
  if (!s) return res.status(503).json({ error: NOT_SET_UP })
  const cs = await s.checkout.sessions.retrieve(p.data.sessionId).catch(() => null)
  if (!cs || cs.client_reference_id !== req.orgId) return res.status(404).json({ error: 'Unknown checkout.' })
  if (cs.status !== 'complete' || typeof cs.subscription !== 'string') return res.json({ active: false })
  const sub = await s.subscriptions.retrieve(cs.subscription)
  await db
    .update(organizations)
    .set({ ...fromStripeSubscription(sub), stripeSubscriptionId: sub.id, stripeCustomerId: String(cs.customer) })
    .where(eq(organizations.id, req.orgId!))
  res.json({ active: true })
}

/** Stripe's own page for the card, invoices and cancelling. */
export async function billingPortal(req: Request, res: Response) {
  const s = stripe()
  if (!s) return res.status(503).json({ error: NOT_SET_UP })
  const org = await orgRow(req.orgId!)
  if (!org.stripeCustomerId) return res.status(400).json({ error: 'Choose a plan first.' })
  const session = await s.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${CLIENT_URL}/admin?section=billing` })
  res.json({ url: session.url })
}

/**
 * Stripe → Dealwise. Unauthenticated, so the signature is the only trust: the raw
 * body is checked against STRIPE_WEBHOOK_SECRET before anything is read.
 */
export async function stripeWebhook(req: Request, res: Response) {
  const s = stripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!s || !secret) return res.status(503).json({ error: 'billing not configured' })
  let event: Stripe.Event
  try {
    event = s.webhooks.constructEvent(req.body as Buffer, req.get('stripe-signature') ?? '', secret)
  } catch {
    return res.status(400).json({ error: 'bad signature' })
  }

  if (event.type === 'checkout.session.completed') {
    const cs = event.data.object
    if (cs.mode === 'subscription' && cs.client_reference_id && typeof cs.subscription === 'string') {
      const sub = await s.subscriptions.retrieve(cs.subscription)
      await db
        .update(organizations)
        .set({ ...fromStripeSubscription(sub), stripeSubscriptionId: sub.id, stripeCustomerId: String(cs.customer) })
        .where(eq(organizations.id, cs.client_reference_id))
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object
    await db
      .update(organizations)
      .set({ ...fromStripeSubscription(sub), stripeSubscriptionId: sub.id })
      .where(eq(organizations.stripeCustomerId, String(sub.customer)))
  }
  res.json({ received: true })
}

/** Keep the Stripe seat count equal to the team size after someone joins or leaves. Await it before responding (it uses the request's transaction); it never throws. */
export async function syncSeats(orgId: string) {
  const s = stripe()
  if (!s) return
  try {
    const org = await orgRow(orgId)
    if (!org?.stripeSubscriptionId || org.subscriptionStatus === 'canceled') return
    const sub = await s.subscriptions.retrieve(org.stripeSubscriptionId)
    const item = sub.items.data[0]
    const seats = await seatsUsed(orgId)
    if (item && item.quantity !== seats) await s.subscriptions.update(sub.id, { items: [{ id: item.id, quantity: seats }] })
  } catch (e) {
    console.error('[billing] seat sync failed', orgId, e)
  }
}
