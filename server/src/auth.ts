import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
export const cookieName = 'token'
export const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false, // set true behind HTTPS in prod
  maxAge: 7 * 24 * 3600 * 1000,
}

export type Role = 'rep' | 'manager' | 'finance' | 'admin'
export interface JwtUser {
  id: string
  role: Role
  email: string
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10)
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash)
export const signToken = (u: JwtUser) => jwt.sign(u, SECRET, { expiresIn: '7d' })
export const verifyToken = (t: string) =>
  jwt.verify(t, SECRET) as JwtUser & { iat: number; exp: number }

// password-reset tokens: raw token goes in the email, only its hash is stored
export const resetTokenTtlMs = 60 * 60 * 1000 // 1 hour
export const hashResetToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex')
export function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, hash: hashResetToken(token), expiresAt: new Date(Date.now() + resetTokenTtlMs) }
}

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
