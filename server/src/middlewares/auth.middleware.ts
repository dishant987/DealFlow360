import type { Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { quotations } from '../models/schema.js'
import { cookieName, verifyToken, type JwtUser, type Role } from '../utils/token.js'

// make req.user available across handlers
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtUser
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ error: 'unauthenticated' })
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'invalid token' })
  }
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
