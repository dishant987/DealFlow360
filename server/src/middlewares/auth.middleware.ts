import type { Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { db, scopeRequest } from '../config/db.js'
import { quotations, users } from '../models/schema.js'
import { cookieName, verifyToken, type JwtUser, type Role } from '../utils/token.js'

// make req.user available across handlers
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtUser
      /** company of this request: the signed-in user's, or a portal quote's */
      orgId?: string
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  let claims
  try {
    claims = verifyToken(token)
  } catch {
    return res.status(401).json({ error: 'invalid token' })
  }
  // The JWT lives 7 days; re-read the account so blocking, deletion and role
  // changes take effect on the next request, not at token expiry.
  const [u] = await db
    .select({ role: users.role, blocked: users.blocked, orgId: users.organizationId })
    .from(users)
    .where(eq(users.id, claims.id))
  if (!u || u.blocked) return res.status(401).json({ error: 'unauthenticated' })
  req.user = { ...claims, role: u.role }
  req.orgId = u.orgId
  // everything after this point only sees this company's data (RLS)
  scopeRequest(u.orgId, res, next)
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}

// A rep works only their own deals — a quotation carries the customer's cost and
// margin, so another rep must not be able to read or edit it. Manager / finance /
// admin already own approvals and reporting, so they see the whole pipeline.
//
// Registered with router.param('id', …) on every router whose `:id` is a
// quotation, so one guard covers read, edit, submit, cancel, send, fulfillment
// and billing rather than a check in each handler.
export async function quotationAccessParam(
  req: Request,
  res: Response,
  next: NextFunction,
  id: string,
) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' })
  if (req.user.role !== 'rep') return next()
  const [q] = await db
    .select({ repId: quotations.repId })
    .from(quotations)
    .where(eq(quotations.id, id))
  if (!q) return res.status(404).json({ error: 'not found' })
  if (q.repId !== req.user.id)
    return res.status(403).json({ error: 'this quotation belongs to another rep' })
  next()
}
