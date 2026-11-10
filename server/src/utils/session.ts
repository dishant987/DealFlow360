import type { Request } from 'express'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../config/db.js'
import { organizations, sessions, users } from '../models/schema.js'
import { accountState } from '../services/plan.js'
import { verifyToken, type JwtUser } from './token.js'
import { disconnectSockets } from '../config/socket.js'

const SEEN_EVERY_MS = 5 * 60 * 1000 // refresh "last active" at most this often

/** Record a new signed-in device and return its id (goes into the token as `sid`). */
export async function openSession(req: Request, userId: string) {
  const [s] = await db
    .insert(sessions)
    .values({ userId, userAgent: req.get('user-agent')?.slice(0, 300) ?? null, ip: req.ip ?? null })
    .returning({ id: sessions.id })
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId))
  return s.id
}

/** Token → live account, or null when the token, account or device is no longer valid. */
export async function loadSession(token: string) {
  let claims: JwtUser
  try {
    claims = verifyToken(token)
  } catch {
    return null
  }
  const [u] = await db
    .select({
      role: users.role,
      blocked: users.blocked,
      orgId: users.organizationId,
      plan: organizations.plan,
      trialEndsAt: organizations.trialEndsAt,
      subscriptionStatus: organizations.subscriptionStatus,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.id, claims.id))
  if (!u || u.blocked) return null
  // shortcut: tokens issued before sessions existed have no sid and stay valid until they expire (7 days)
  if (claims.sid) {
    const [s] = await db
      .select({ lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(and(eq(sessions.id, claims.sid), eq(sessions.userId, claims.id), isNull(sessions.revokedAt)))
    if (!s) return null
    if (Date.now() - s.lastSeenAt.getTime() > SEEN_EVERY_MS)
      await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, claims.sid))
  }
  return { claims, role: u.role, orgId: u.orgId, account: accountState(u) }
}

/** Sign a user out of every device (or every device but `keep`), live sockets included. */
export async function revokeSessions(userId: string, keep?: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), keep ? ne(sessions.id, keep) : undefined))
  disconnectSockets(userId, keep)
}

export async function revokeSession(userId: string, sid: string) {
  const [s] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sid), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id })
  if (s) disconnectSockets(userId, undefined, sid)
  return !!s
}
