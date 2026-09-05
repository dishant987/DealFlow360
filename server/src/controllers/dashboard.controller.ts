import type { Request, Response } from 'express'
import { and, eq, inArray, lt, gt } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  quotations,
  customers,
  users,
  fulfillmentAllocations,
  appSettings,
  auditLog,
} from '../models/schema.js'
import { findDiscountAnomalies } from '../services/anomaly.js'

const ACTIVE = ['draft', 'pending_approval', 'sent', 'under_negotiation'] as const

export async function getDealHealth(_req: Request, res: Response) {
  const [settings] = await db.select().from(appSettings).limit(1)
  const stalledDays = settings ? settings.stalledDays : 7
  const cutoff = new Date(Date.now() - stalledDays * 86_400_000)

  // stalled: active + no activity since cutoff
  const stalled = await db
    .select({
      id: quotations.id,
      customer: customers.name,
      rep: users.name,
      status: quotations.status,
      lastActivityAt: quotations.lastActivityAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .innerJoin(users, eq(quotations.repId, users.id))
    .where(and(inArray(quotations.status, [...ACTIVE]), lt(quotations.lastActivityAt, cutoff)))

  // discount anomalies: risk score well above rep's own average
  const all = await db
    .select({
      id: quotations.id,
      repId: quotations.repId,
      riskScore: quotations.riskScore,
      customer: customers.name,
      rep: users.name,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .innerJoin(users, eq(quotations.repId, users.id))
  const flagged = findDiscountAnomalies(
    all.map((q) => ({ id: q.id, repId: q.repId, riskScore: Number(q.riskScore) })),
  )
  const byId = new Map(all.map((q) => [q.id, q]))
  const anomalies = flagged.map((f) => ({
    id: f.id,
    riskScore: f.riskScore,
    repAvg: f.repAvg,
    customer: byId.get(f.id)?.customer,
    rep: byId.get(f.id)?.rep,
  }))

  // delivery slippage: quotes with backordered allocations
  const slippageRows = await db
    .selectDistinct({ id: quotations.id, customer: customers.name })
    .from(fulfillmentAllocations)
    .innerJoin(quotations, eq(fulfillmentAllocations.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(and(eq(fulfillmentAllocations.backordered, true), gt(fulfillmentAllocations.quantity, 0)))

  res.json({
    stalledDays,
    stalled: stalled.map((s) => ({
      ...s,
      daysInactive: Math.floor((Date.now() - new Date(s.lastActivityAt).getTime()) / 86_400_000),
    })),
    anomalies,
    slippage: slippageRows,
  })
}

// automated nudge / escalation triggered from an alert
export async function nudge(req: Request<{ id: string }>, res: Response) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
  if (!q) return res.status(404).json({ error: 'not found' })
  await db.insert(auditLog).values({
    quotationId: q.id,
    userId: req.user!.id,
    action: 'nudge',
    detail: { note: 'follow-up nudge triggered from deal-health dashboard' },
  })
  res.json({ ok: true })
}
