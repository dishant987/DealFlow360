import type { Request, Response } from 'express'
import { and, desc, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm'
import { db } from '../config/db.js'
import { auditLog, quotations, customers, users } from '../models/schema.js'
import { quoteNumber } from '../services/quoteNumber.js'

/**
 * Notifications are DERIVED from the audit trail rather than fanned out into a
 * table of their own. Every event worth telling someone about is already
 * recorded there with its actor, its quotation and its timestamp, so a second
 * copy would only be a second thing to keep in step.
 *
 * Read state lives on the client (a "last seen" stamp), which is why nothing
 * here is mutated — see the note on the bell component.
 */

type Kind = 'approval' | 'customer' | 'fulfillment' | 'billing' | 'alert'

// what each action means to the person reading it. Anything not listed here is
// bookkeeping — a rep does not need to be told their own line was added.
const MEANING: Record<string, { title: string; kind: Kind }> = {
  'approve:manager': { title: 'Approved by the sales manager', kind: 'approval' },
  'approve:finance': { title: 'Approved by finance', kind: 'approval' },
  'reject:manager': { title: 'Rejected by the sales manager', kind: 'approval' },
  'reject:finance': { title: 'Rejected by finance', kind: 'approval' },
  'return:manager': { title: 'Returned for revision', kind: 'approval' },
  'return:finance': { title: 'Returned for revision by finance', kind: 'approval' },
  submitted: { title: 'Submitted for approval', kind: 'approval' },
  customer_comment: { title: 'Customer left a comment', kind: 'customer' },
  customer_change_request: { title: 'Customer requested a change', kind: 'customer' },
  customer_counter_discount: { title: 'Customer countered on price', kind: 'customer' },
  customer_confirmed: { title: 'Customer confirmed the quotation', kind: 'customer' },
  customer_confirm_reapproval: {
    title: 'Customer confirmed — their terms need approval',
    kind: 'customer',
  },
  fulfillment_accepted: { title: 'Warehouse split accepted', kind: 'fulfillment' },
  stock_replenished: { title: 'Stock received into a warehouse', kind: 'fulfillment' },
  billing_generated: { title: 'Billing generated', kind: 'billing' },
  payment_recorded: { title: 'Payment recorded', kind: 'billing' },
  subscription_cancelled: { title: 'Subscription cancelled', kind: 'billing' },
  nudge: { title: 'You were nudged about a stalled deal', kind: 'alert' },
  escalate: { title: 'Deal escalated to the sales manager', kind: 'alert' },
}

// A rep hears about their own deals moving. An approver hears about work
// arriving and about customers pushing back, across the pipeline.
const REP_ACTIONS = Object.keys(MEANING).filter((a) => a !== 'submitted')
const APPROVER_ACTIONS = [
  'submitted',
  'customer_counter_discount',
  'customer_confirm_reapproval',
  'customer_confirmed',
  'customer_change_request',
  // the outcome of chains they are part of
  'reject:manager',
  'reject:finance',
]

export async function listNotifications(req: Request, res: Response) {
  const me = req.user!
  const limit = Math.min(Number(req.query.limit) || 30, 100)

  // A rep is scoped to their own deals — the same rule as everywhere else.
  // Approvers see the pipeline, but only the events that ask something of them.
  const scope: SQL | undefined =
    me.role === 'rep'
      ? and(eq(quotations.repId, me.id), inArray(auditLog.action, REP_ACTIONS))
      : inArray(auditLog.action, APPROVER_ACTIONS)

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
      actor: users.name,
      quotationId: auditLog.quotationId,
      seqNo: quotations.seqNo,
      quoteCreatedAt: quotations.createdAt,
      customer: customers.name,
      status: quotations.status,
    })
    .from(auditLog)
    .innerJoin(quotations, eq(auditLog.quotationId, quotations.id))
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(
      and(
        scope,
        // Never notify someone about their own doing. A customer acting through
        // the portal leaves userId NULL, and `ne` on NULL is NULL — which would
        // silently drop exactly the events a rep most needs — so spell out the
        // null case rather than relying on the comparison.
        or(ne(auditLog.userId, me.id), isNull(auditLog.userId)),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)

  res.json(
    rows
      .filter((r) => MEANING[r.action])
      .map((r) => ({
        id: r.id,
        kind: MEANING[r.action].kind,
        title: MEANING[r.action].title,
        reason: r.reason,
        // a portal action has no internal user behind it
        actor: r.actor ?? 'the customer',
        quotationId: r.quotationId,
        quoteNumber: quoteNumber(r.seqNo, r.quoteCreatedAt),
        customer: r.customer,
        status: r.status,
        createdAt: r.createdAt,
      })),
  )
}
