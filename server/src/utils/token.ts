import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { isProd } from '../config/env.js'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export const cookieName = 'token'
export const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd, // HTTPS-only in production; plain http on localhost
  maxAge: 7 * 24 * 3600 * 1000,
}

export type Role = 'rep' | 'manager' | 'finance' | 'admin'
export interface JwtUser {
  id: string
  role: Role
  email: string
}

// Password (or Google) accepted but MFA still owed: a 5-minute token that can
// only be traded for a session at /auth/mfa/verify, never used as one.
export const mfaCookieName = 'mfa_pending'
export const mfaCookieOpts = { ...cookieOpts, maxAge: 5 * 60 * 1000 }
export const signMfaPending = (id: string) => jwt.sign({ id, purpose: 'mfa' }, SECRET, { expiresIn: '5m' })
export function verifyMfaPending(t: string): string | null {
  try {
    const p = jwt.verify(t, SECRET) as { id?: string; purpose?: string }
    return p.purpose === 'mfa' && p.id ? p.id : null
  } catch {
    return null
  }
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
