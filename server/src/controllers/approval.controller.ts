import type { Request, Response } from 'express'
import { z } from 'zod'
import { and, eq, inArray, asc, isNull } from 'drizzle-orm'
import { db } from '../config/db.js'
import { quotations, approvals, auditLog, customers, users } from '../models/schema.js'
import { scoreQuotation } from './quotation.controller.js'
import { quoteNumber } from '../services/quoteNumber.js'

type Step = 'manager' | 'finance'

// which pending step (if any) this role may act on for a quote's approval rows
function stepForRole(
  role: string,
  steps: { step: Step; action: string | null }[],
): Step | null {
  const pendingManager = steps.find((s) => s.step === 'manager' && s.action === null)
  const managerApproved = steps.some((s) => s.step === 'manager' && s.action === 'approve')
  const noManagerStep = !steps.some((s) => s.step === 'manager')
  const pendingFinance = steps.find((s) => s.step === 'finance' && s.action === null)

  if (role === 'manager') return pendingManager ? 'manager' : null
  if (role === 'finance')
    return pendingFinance && (managerApproved || noManagerStep) ? 'finance' : null
  if (role === 'admin') {
    if (pendingManager) return 'manager'
    if (pendingFinance && (managerApproved || noManagerStep)) return 'finance'
  }
  return null
}

/* ---- list quotes awaiting THIS user's approval ---- */
export async function listApprovals(req: Request, res: Response) {
  const role = req.user!.role
  const pend = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      createdAt: quotations.createdAt,
      customer: customers.name,
      riskScore: quotations.riskScore,
      requiresFinance: quotations.requiresFinance,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.status, 'pending_approval'))

  const ids = pend.map((q) => q.id)
  const steps = ids.length
    ? await db.select().from(approvals).where(inArray(approvals.quotationId, ids))
    : []
  const byQuote = new Map<string, { step: Step; action: string | null }[]>()
  for (const s of steps) {
    const arr = byQuote.get(s.quotationId) ?? []
    arr.push({ step: s.step, action: s.action })
    byQuote.set(s.quotationId, arr)
  }

  const visible = pend
    .map((q) => ({ ...q, yourStep: stepForRole(role, byQuote.get(q.id) ?? []) }))
    .filter((q) => q.yourStep !== null)
  res.json(visible.map((v: any) => ({ ...v, quoteNumber: quoteNumber(v.seqNo, v.createdAt) })))
}

/* ---- detail: quote + risk breaches + steps + audit trail ---- */
export async function getApprovalDetail(req: Request<{ id: string }>, res: Response) {
  const [quote] = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      createdAt: quotations.createdAt,
      customer: customers.name,
      customerTier: customers.tier,
      status: quotations.status,
      riskScore: quotations.riskScore,
      requiresManager: quotations.requiresManager,
      requiresFinance: quotations.requiresFinance,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, req.params.id))
  if (!quote) return res.status(404).json({ error: 'not found' })

  const steps = await db
    .select({
      id: approvals.id,
      step: approvals.step,
      action: approvals.action,
      reason: approvals.reason,
      approverId: approvals.approverId,
      approver: users.name,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .leftJoin(users, eq(approvals.approverId, users.id))
    .where(eq(approvals.quotationId, req.params.id))
    .orderBy(asc(approvals.createdAt))

  const audit = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      reason: auditLog.reason,
      detail: auditLog.detail,
      user: users.name,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(eq(auditLog.quotationId, req.params.id))
    .orderBy(asc(auditLog.createdAt))

  const risk = await scoreQuotation(req.params.id)
  res.json({
    ...quote,
    quoteNumber: quoteNumber(quote.seqNo, quote.createdAt),
    steps,
    audit,
    risk,
    yourStep: stepForRole(req.user!.role, steps),
  })
}

/* ---- approve / reject / return ---- */
const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'return']),
  reason: z.string().optional(),
})

export async function actOnApproval(req: Request<{ id: string }>, res: Response) {
  const parsed = actionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { action, reason } = parsed.data

  const steps = await db.select().from(approvals).where(eq(approvals.quotationId, req.params.id))
  const step = stepForRole(
    req.user!.role,
    steps.map((s) => ({ step: s.step, action: s.action })),
  )
  if (!step)
    return res.status(403).json({ error: 'no pending approval step for your role on this quote' })

  const target = steps.find((s) => s.step === step && s.action === null)!
  await db
    .update(approvals)
    .set({ action, reason: reason ?? null, approverId: req.user!.id })
    .where(eq(approvals.id, target.id))

  // recompute quote status
  let status: 'approved' | 'rejected' | 'pending_approval' | 'draft'
  if (action === 'reject') status = 'rejected'
  else if (action === 'return') status = 'draft'
  else {
    const remaining = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.quotationId, req.params.id), isNull(approvals.action)))
    status = remaining.length === 0 ? 'approved' : 'pending_approval'
  }

  const [q] = await db
    .update(quotations)
    .set({ status, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(quotations.id, req.params.id))
    .returning()

  await db.insert(auditLog).values({
    quotationId: req.params.id,
    userId: req.user!.id,
    action: `${action}:${step}`,
    reason: reason ?? null,
  })

  res.json({ quotation: q, step, action })
}
