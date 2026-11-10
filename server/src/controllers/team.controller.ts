import type { Request, Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../config/db.js'
import { customers, organizations, quotations, sessions, users } from '../models/schema.js'
import { generateResetToken, hashPassword, inviteTtlMs } from '../utils/token.js'
import { sendInvite } from '../utils/mailer.js'
import { revokeSessions } from '../utils/session.js'
import { inviteAction, memberStatus, transferProblem } from '../services/team.js'
import { syncSeats } from './plan.controller.js'

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const roleEnum = z.enum(['rep', 'manager', 'finance', 'admin'])
// users aren't under RLS: every lookup here is pinned to the caller's company
const inOrg = (req: Request, id: string) => and(eq(users.id, id), eq(users.organizationId, req.orgId!))

/** Invite by email: the account exists at once (so it can be given work), and joins when they set a password. */
export async function inviteUser(req: Request, res: Response) {
  const p = z.object({ name: z.string().trim().min(1), email: z.string().email(), role: roleEnum }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.issues })
  const email = p.data.email.toLowerCase()
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`)
  const action = inviteAction(existing, req.orgId!)
  if (action === 'taken') return res.status(409).json({ error: 'That email already has a Dealwise account.' })

  const { token, hash, expiresAt } = generateResetToken(inviteTtlMs)
  const values = { resetTokenHash: hash, resetTokenExpiresAt: expiresAt, invitedAt: new Date() }
  const [u] =
    action === 'resend'
      ? await db.update(users).set({ ...values, name: p.data.name, role: p.data.role }).where(eq(users.id, existing!.id)).returning()
      : await db
          .insert(users)
          .values({
            ...values,
            name: p.data.name,
            email,
            role: p.data.role,
            organizationId: req.orgId!,
            // unusable until they choose their own through the link
            passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          })
          .returning()

  const [[me], [org]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, req.user!.id)),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, req.orgId!)),
  ])
  await sendInvite(email, `${CLIENT_URL}/reset-password?token=${token}&invite=1`, me?.name ?? 'Your admin', org?.name ?? 'your company')
  await syncSeats(req.orgId!)
  res.status(action === 'resend' ? 200 : 201).json({ id: u.id, name: u.name, email: u.email, role: u.role, status: 'invited', resent: action === 'resend' })
}

/** Everything an admin needs about one teammate. */
export async function getUser(req: Request<{ id: string }>, res: Response) {
  const [u] = await db
    .select({
      id: users.id, name: users.name, email: users.email, role: users.role, blocked: users.blocked,
      invitedAt: users.invitedAt, emailVerifiedAt: users.emailVerifiedAt, lastLoginAt: users.lastLoginAt,
      mfaEnabled: users.mfaEnabled, createdAt: users.createdAt,
    })
    .from(users)
    .where(inOrg(req, req.params.id))
  if (!u) return res.status(404).json({ error: 'not found' })

  const OPEN = ['draft', 'pending_approval', 'approved', 'sent', 'under_negotiation'] as const
  const [[quotes], [openQuotes], [owned], devices] = await Promise.all([
    db.select({ n: count() }).from(quotations).where(eq(quotations.repId, u.id)),
    db.select({ n: count() }).from(quotations).where(and(eq(quotations.repId, u.id), inArray(quotations.status, [...OPEN]))),
    db.select({ n: count() }).from(customers).where(eq(customers.ownerId, u.id)),
    db
      .select({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, u.id))
      .orderBy(desc(sessions.createdAt))
      .limit(20),
  ])
  res.json({
    ...u,
    status: memberStatus(u),
    owns: { quotations: quotes.n, openQuotations: openQuotes.n, customers: owned.n },
    sessions: devices,
  })
}

export async function signOutUser(req: Request<{ id: string }>, res: Response) {
  const [u] = await db.select({ id: users.id }).from(users).where(inOrg(req, req.params.id))
  if (!u) return res.status(404).json({ error: 'not found' })
  await revokeSessions(u.id)
  res.json({ ok: true })
}

/** Hand someone's deals and customers to a teammate, e.g. before they leave. */
export async function transferUserWork(req: Request<{ id: string }>, res: Response) {
  const p = z.object({ toUserId: z.string().uuid() }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Pick who should take over.' })
  const pick = { id: users.id, organizationId: users.organizationId, blocked: users.blocked, invitedAt: users.invitedAt }
  const [[from], [to]] = await Promise.all([
    db.select(pick).from(users).where(inOrg(req, req.params.id)),
    db.select(pick).from(users).where(inOrg(req, p.data.toUserId)),
  ])
  const problem = transferProblem(from, to, req.orgId!)
  if (problem) return res.status(problem === 'User not found.' ? 404 : 400).json({ error: problem })

  const moved = await db.update(quotations).set({ repId: to!.id }).where(eq(quotations.repId, from!.id)).returning({ id: quotations.id })
  const movedCustomers = await db.update(customers).set({ ownerId: to!.id }).where(eq(customers.ownerId, from!.id)).returning({ id: customers.id })
  res.json({ quotations: moved.length, customers: movedCustomers.length })
}
