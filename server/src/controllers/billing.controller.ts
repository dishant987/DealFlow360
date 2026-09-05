import type { Request, Response } from 'express'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  quoteLines,
  products,
  subscriptionPlans,
  invoices,
  billingSchedules,
  creditNotes,
  payments,
  auditLog,
} from '../models/schema.js'
import { computeLine } from '../services/pricing.js'
import {
  nextBillingDate,
  intervalDays,
  daysBetween,
  proratedAmount,
  refundAmount,
  type Interval,
} from '../services/billing.js'

const round2 = (x: number) => Math.round(x * 100) / 100

// invoices may only be raised once the deal has cleared approval
const BILLABLE = ['approved', 'confirmed', 'fulfilled', 'invoiced']

/* ---- generate invoices + subscription schedules ---- */
export async function generateBilling(req: Request<{ id: string }>, res: Response) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!q) return res.status(404).json({ error: 'not found' })
  if (!BILLABLE.includes(q.status))
    return res.status(400).json({
      error: `This quotation is ${q.status.replace(/_/g, ' ')} — it must be approved before billing can be generated.`,
    })

  // Regenerating deletes the invoices, and payments cascade with them — so once
  // money has been recorded the billing run is locked.
  const existing = await db.select().from(invoices).where(eq(invoices.quotationId, req.params.id))
  if (existing.some((i) => i.status === 'paid'))
    return res.status(400).json({
      error:
        'Billing cannot be regenerated — a payment has already been recorded against this quotation.',
    })

  const lines = await db
    .select({
      id: quoteLines.id,
      quantity: quoteLines.quantity,
      unitPrice: quoteLines.unitPrice,
      unitCost: quoteLines.unitCost,
      discountPct: quoteLines.discountPct,
      lineType: quoteLines.lineType,
      subscriptionPlanId: quoteLines.subscriptionPlanId,
      interval: subscriptionPlans.interval,
    })
    .from(quoteLines)
    .leftJoin(subscriptionPlans, eq(quoteLines.subscriptionPlanId, subscriptionPlans.id))
    .where(eq(quoteLines.quotationId, req.params.id))

  // regenerate cleanly
  await db.delete(invoices).where(eq(invoices.quotationId, req.params.id))
  await db.delete(billingSchedules).where(eq(billingSchedules.quotationId, req.params.id))

  const now = new Date()
  const oneTimeTotal = lines
    .filter((l) => l.lineType === 'onetime')
    .reduce((sum, l) => sum + computeLine(l).net, 0)

  if (oneTimeTotal > 0) {
    const due = new Date(now)
    due.setDate(due.getDate() + 14)
    await db.insert(invoices).values({
      quotationId: req.params.id,
      type: 'onetime',
      status: 'sent',
      amount: String(round2(oneTimeTotal)),
      dueAt: due,
    })
  }

  for (const l of lines.filter((x) => x.lineType === 'subscription' && x.subscriptionPlanId)) {
    await db.insert(billingSchedules).values({
      quotationId: req.params.id,
      quoteLineId: l.id,
      subscriptionPlanId: l.subscriptionPlanId!,
      nextBillingDate: nextBillingDate(now, (l.interval ?? 'monthly') as Interval),
      amount: String(computeLine(l).net),
      status: 'scheduled',
    })
  }

  await db
    .update(quotations)
    .set({ status: 'invoiced', updatedAt: now, lastActivityAt: now })
    .where(eq(quotations.id, req.params.id))
  await db.insert(auditLog).values({
    quotationId: req.params.id,
    userId: req.user!.id,
    action: 'billing_generated',
    detail: { oneTimeTotal: round2(oneTimeTotal) },
  })

  res.json(await billingView(req.params.id))
}

async function billingView(quotationId: string) {
  const invs = await db.select().from(invoices).where(eq(invoices.quotationId, quotationId))
  const schedules = await db
    .select({
      id: billingSchedules.id,
      quoteLineId: billingSchedules.quoteLineId,
      product: products.name,
      plan: subscriptionPlans.name,
      interval: subscriptionPlans.interval,
      nextBillingDate: billingSchedules.nextBillingDate,
      amount: billingSchedules.amount,
      status: billingSchedules.status,
      quantity: quoteLines.quantity,
    })
    .from(billingSchedules)
    .innerJoin(quoteLines, eq(billingSchedules.quoteLineId, quoteLines.id))
    .innerJoin(products, eq(quoteLines.productId, products.id))
    .innerJoin(subscriptionPlans, eq(billingSchedules.subscriptionPlanId, subscriptionPlans.id))
    .where(eq(billingSchedules.quotationId, quotationId))
  const credits = await db.select().from(creditNotes).where(eq(creditNotes.quotationId, quotationId))
  return { invoices: invs, schedules, creditNotes: credits }
}

export async function getBilling(req: Request<{ id: string }>, res: Response) {
  res.json(await billingView(req.params.id))
}

/* ---- mid-cycle quantity change → prorated charge or credit ---- */
export async function changeSubscription(
  req: Request<{ id: string; lineId: string }>,
  res: Response,
) {
  const parsed = z.object({ quantity: z.number().int().positive() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [line] = await db
    .select({
      id: quoteLines.id,
      unitPrice: quoteLines.unitPrice,
      discountPct: quoteLines.discountPct,
      quantity: quoteLines.quantity,
    })
    .from(quoteLines)
    .where(eq(quoteLines.id, req.params.lineId))
  if (!line) return res.status(404).json({ error: 'line not found' })

  const [sched] = await db
    .select({
      id: billingSchedules.id,
      nextBillingDate: billingSchedules.nextBillingDate,
      interval: subscriptionPlans.interval,
      prorationEnabled: subscriptionPlans.prorationEnabled,
    })
    .from(billingSchedules)
    .innerJoin(subscriptionPlans, eq(billingSchedules.subscriptionPlanId, subscriptionPlans.id))
    .where(eq(billingSchedules.quoteLineId, req.params.lineId))
  if (!sched) return res.status(400).json({ error: 'no active subscription schedule for this line' })

  const perUnit = Number(line.unitPrice) * (1 - Number(line.discountPct) / 100)
  const newPeriod = round2(perUnit * parsed.data.quantity)
  const oldPeriod = round2(perUnit * line.quantity)
  const delta = newPeriod - oldPeriod

  const daysRemaining = daysBetween(new Date(), new Date(sched.nextBillingDate))
  // when the plan disables proration the change simply takes effect next cycle —
  // no immediate charge or credit
  const prorated = sched.prorationEnabled
    ? proratedAmount(Math.abs(delta), daysRemaining, intervalDays(sched.interval as Interval))
    : 0

  if (delta > 0 && prorated > 0) {
    await db.insert(invoices).values({
      quotationId: req.params.id,
      type: 'recurring',
      status: 'sent',
      amount: String(prorated),
    })
  } else if (delta < 0 && prorated > 0) {
    await db.insert(creditNotes).values({
      quotationId: req.params.id,
      amount: String(prorated),
      reason: 'Mid-cycle downgrade (prorated credit)',
    })
  }

  await db.update(quoteLines).set({ quantity: parsed.data.quantity }).where(eq(quoteLines.id, line.id))
  await db.update(billingSchedules).set({ amount: String(newPeriod) }).where(eq(billingSchedules.id, sched.id))
  await db.insert(auditLog).values({
    quotationId: req.params.id,
    userId: req.user!.id,
    action: 'subscription_changed',
    detail: {
      lineId: line.id,
      from: line.quantity,
      to: parsed.data.quantity,
      prorated,
      delta,
      prorationEnabled: sched.prorationEnabled,
    },
  })

  res.json(await billingView(req.params.id))
}

/* ---- cancel subscription → prorated refund credit note ---- */
export async function cancelSubscription(
  req: Request<{ id: string; lineId: string }>,
  res: Response,
) {
  const [sched] = await db
    .select({
      id: billingSchedules.id,
      amount: billingSchedules.amount,
      nextBillingDate: billingSchedules.nextBillingDate,
      interval: subscriptionPlans.interval,
      refundPct: subscriptionPlans.cancellationRefundPct,
    })
    .from(billingSchedules)
    .innerJoin(subscriptionPlans, eq(billingSchedules.subscriptionPlanId, subscriptionPlans.id))
    .where(eq(billingSchedules.quoteLineId, req.params.lineId))
  if (!sched) return res.status(404).json({ error: 'schedule not found' })

  const daysRemaining = daysBetween(new Date(), new Date(sched.nextBillingDate))
  const refund = refundAmount(
    Number(sched.amount),
    daysRemaining,
    intervalDays(sched.interval as Interval),
    Number(sched.refundPct),
  )
  if (refund > 0) {
    await db.insert(creditNotes).values({
      quotationId: req.params.id,
      amount: String(refund),
      reason: 'Subscription cancelled (prorated refund)',
    })
  }
  await db.update(billingSchedules).set({ status: 'cancelled' }).where(eq(billingSchedules.id, sched.id))
  await db.insert(auditLog).values({
    quotationId: req.params.id,
    userId: req.user!.id,
    action: 'subscription_cancelled',
    detail: { lineId: req.params.lineId, refund },
  })

  res.json(await billingView(req.params.id))
}

/* ---- record a payment against an invoice ---- */
export async function payInvoice(req: Request<{ invoiceId: string }>, res: Response) {
  const parsed = z
    .object({ amount: z.union([z.number(), z.string()]).optional(), method: z.string().optional() })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, req.params.invoiceId))
  if (!inv) return res.status(404).json({ error: 'invoice not found' })

  const amount = parsed.data.amount != null ? String(parsed.data.amount) : inv.amount
  await db.insert(payments).values({ invoiceId: inv.id, amount, method: parsed.data.method ?? 'manual' })
  const [updated] = await db
    .update(invoices)
    .set({ status: 'paid', paidAt: new Date() })
    .where(eq(invoices.id, inv.id))
    .returning()
  await db.insert(auditLog).values({
    quotationId: inv.quotationId,
    userId: req.user!.id,
    action: 'payment_recorded',
    detail: { invoiceId: inv.id, amount },
  })

  res.json(updated)
}
