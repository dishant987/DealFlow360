import type { Request, Response, NextFunction } from 'express'
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
