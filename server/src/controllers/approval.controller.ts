import type { Request, Response } from 'express'
import { z } from 'zod'
import { and, eq, asc, desc, inArray, isNull } from 'drizzle-orm'
import { db } from '../config/db.js'
import { quotations, approvals, auditLog, customers, users, appSettings } from '../models/schema.js'
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

/* ---- list every quotation that needed, needs, or went through approval ----
   Not just the ones pending for this user: an approver has to be able to see what
   the other step is sitting on, and what was already decided. `yourStep` still
   says whether THIS user can act, which is what gates the Review button. */
export async function listApprovals(req: Request, res: Response) {
  const role = req.user!.role

  const quotes = await db
    .select({
      id: quotations.id,
      seqNo: quotations.seqNo,
      createdAt: quotations.createdAt,
      customer: customers.name,
      status: quotations.status,
      riskScore: quotations.riskScore,
      requiresFinance: quotations.requiresFinance,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))

  const steps = await db
    .select({
      quotationId: approvals.quotationId,
      step: approvals.step,
      action: approvals.action,
      approver: users.name,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .leftJoin(users, eq(approvals.approverId, users.id))
    .orderBy(asc(approvals.createdAt))

  const byQuote = new Map<string, typeof steps>()
  for (const s of steps) {
    const arr = byQuote.get(s.quotationId) ?? []
    arr.push(s)
    byQuote.set(s.quotationId, arr)
  }

  const [settings] = await db.select().from(appSettings).limit(1)
  const managerThreshold = settings ? Number(settings.managerThreshold) : 5
  const financeThreshold = settings ? Number(settings.financeThreshold) : 12
  const riskLabel = (score: number) =>
    score > financeThreshold ? 'HIGH' : score > managerThreshold ? 'MEDIUM' : 'LOW'

  const rows = quotes
    // a quote belongs on this screen once it has been through the router: it has
    // approval steps, or it cleared with none needed (auto-approved)
    .filter((q) => (byQuote.get(q.id)?.length ?? 0) > 0 || q.status === 'approved')
    .map((q) => {
      const mine = byQuote.get(q.id) ?? []
      const acted = [...mine].reverse().find((s) => s.action !== null)
      const pendingStep = mine.find((s) => s.action === null)

      let stage: string
      let outcome: 'pending' | 'returned' | 'approved' | 'rejected'
      if (mine.length === 0) {
        stage = 'Auto-Approved'
        outcome = 'approved'
      } else if (q.status === 'pending_approval') {
        stage = pendingStep?.step === 'finance' ? 'Finance' : 'Sales Manager'
        outcome = 'pending'
      } else if (q.status === 'rejected') {
        stage = 'Rejected'
        outcome = 'rejected'
      } else if (acted?.action === 'return') {
        stage = 'Returned for revision'
        outcome = 'returned'
      } else if (q.status === 'approved') {
        stage = 'Approved'
        outcome = 'approved'
      } else {
        stage = q.status.replace(/_/g, ' ')
        outcome = 'approved'
      }

      return {
        id: q.id,
        quoteNumber: quoteNumber(q.seqNo, q.createdAt),
        customer: q.customer,
        status: q.status,
        riskScore: q.riskScore,
        riskLabel: mine.length === 0 ? 'LOW' : riskLabel(Number(q.riskScore)),
        stage,
        outcome,
        // nobody is pre-assigned a step in this model — show who last acted instead
        assignedTo: acted?.approver ?? '—',
        updatedAt: q.updatedAt,
        yourStep: stepForRole(
          role,
          mine.map((s) => ({ step: s.step, action: s.action })),
        ),
      }
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

  res.json({
    rows,
    summary: {
      pending: rows.filter((r) => r.outcome === 'pending').length,
      returned: rows.filter((r) => r.outcome === 'returned').length,
      approved: rows.filter((r) => r.outcome === 'approved').length,
      rejected: rows.filter((r) => r.outcome === 'rejected').length,
      actionable: rows.filter((r) => r.yourStep !== null).length,
    },
  })
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
// A3: every rejection or return must carry a reason, so the audit trail says WHY
// a deal was turned back. The approval screen enforces this too, but the rule
// belongs here — otherwise any direct API call walks straight past it.
const actionSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'return']),
    reason: z.string().optional(),
  })
  .refine((d) => d.action === 'approve' || !!d.reason?.trim(), {
    path: ['reason'],
    message: 'A reason is required to reject or return a quotation.',
  })

/** Did the pending review start because the customer confirmed a counter-offer,
 *  rather than because the rep submitted the quote? Whichever of the two events
 *  happened last is the one that opened the chain now being decided. */
async function openedByCustomerConfirmation(quotationId: string) {
  const [latest] = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.quotationId, quotationId),
        inArray(auditLog.action, ['submitted', 'customer_confirm_reapproval']),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1)
  return latest?.action === 'customer_confirm_reapproval'
}

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
  let status: 'approved' | 'rejected' | 'pending_approval' | 'draft' | 'confirmed'
  if (action === 'reject') status = 'rejected'
  else if (action === 'return') status = 'draft'
  else {
    const remaining = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.quotationId, req.params.id), isNull(approvals.action)))
    // A chain the CUSTOMER opened by confirming a counter-offer ends in
    // 'confirmed', not 'approved'. They already accepted these terms — §3 gives
    // them one click, not two — and the portal closes to them while the review
    // runs, so landing on 'approved' would strand the deal with nobody able to
    // move it: the customer cannot confirm again and the rep has to re-send.
    status =
      remaining.length === 0
        ? (await openedByCustomerConfirmation(req.params.id))
          ? 'confirmed'
          : 'approved'
        : 'pending_approval'
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
