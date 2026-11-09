import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { auditLog, users } from '../models/schema.js'
import {
  cookieName,
  cookieOpts,
  mfaCookieName,
  mfaCookieOpts,
  signMfaPending,
  signToken,
  verifyMfaPending,
  verifyPassword,
} from '../utils/token.js'
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashCode,
  otpauthUri,
  verifyTotp,
} from '../utils/totp.js'

type UserRow = typeof users.$inferSelect

const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role, mfaEnabled: u.mfaEnabled })

/** Finish a sign-in that already proved the password (or Google): open a session, or ask for the MFA code first. */
export function completeSignIn(res: Response, u: UserRow, mfaPassed = false) {
  if (u.mfaEnabled && !mfaPassed) {
    res.cookie(mfaCookieName, signMfaPending(u.id), mfaCookieOpts)
    return { mfaRequired: true as const }
  }
  res.cookie(cookieName, signToken({ id: u.id, role: u.role, email: u.email }), cookieOpts)
  return publicUser(u)
}

const audit = (userId: string, action: string) => db.insert(auditLog).values({ userId, action, detail: {} })

/* ---- second step of sign-in ---- */
const verifySchema = z.object({ code: z.string().min(6).max(20) })

export async function verifyMfa(req: Request, res: Response) {
  const id = verifyMfaPending(req.cookies?.[mfaCookieName] ?? '')
  if (!id) return res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' })
  const p = verifySchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Enter the 6-digit code or a recovery code.' })

  const [u] = await db.select().from(users).where(eq(users.id, id))
  if (!u || u.blocked || !u.mfaEnabled || !u.mfaSecret)
    return res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' })

  const code = p.data.code.trim()
  let ok = verifyTotp(decryptSecret(u.mfaSecret), code)
  if (!ok) {
    // a recovery code works once: remove it as it is spent
    const h = hashCode(code)
    if (u.mfaRecoveryHashes.includes(h)) {
      ok = true
      await db
        .update(users)
        .set({ mfaRecoveryHashes: u.mfaRecoveryHashes.filter((x) => x !== h) })
        .where(eq(users.id, u.id))
      await audit(u.id, 'mfa_recovery_code_used')
    }
  }
  if (!ok) return res.status(401).json({ error: 'That code is not valid. Try the latest code from your app.' })

  res.clearCookie(mfaCookieName)
  res.json(completeSignIn(res, u, true))
}

/* ---- setup / enable / disable (signed in) ---- */
export async function setupMfa(req: Request, res: Response) {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id))
  if (!u) return res.status(404).json({ error: 'not found' })
  if (u.mfaEnabled) return res.status(400).json({ error: 'Two-factor authentication is already on.' })
  // a fresh secret each time setup starts; it only goes live after a code is confirmed
  const secret = generateSecret()
  await db.update(users).set({ mfaSecret: encryptSecret(secret) }).where(eq(users.id, u.id))
  res.json({ secret, uri: otpauthUri(secret, u.email) })
}

export async function enableMfa(req: Request, res: Response) {
  const p = verifySchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Enter the 6-digit code from your app.' })
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id))
  if (!u?.mfaSecret || u.mfaEnabled) return res.status(400).json({ error: 'Start setup first.' })
  if (!verifyTotp(decryptSecret(u.mfaSecret), p.data.code))
    return res.status(400).json({ error: 'That code is not valid. Check the time on your phone and try again.' })
  const { codes, hashes } = generateRecoveryCodes()
  await db.update(users).set({ mfaEnabled: true, mfaRecoveryHashes: hashes }).where(eq(users.id, u.id))
  await audit(u.id, 'mfa_enabled')
  // the only time the plain codes exist
  res.json({ recoveryCodes: codes })
}

const disableSchema = z.object({ password: z.string().min(1) })
export async function disableMfa(req: Request, res: Response) {
  const p = disableSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Enter your password to turn this off.' })
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id))
  if (!u) return res.status(404).json({ error: 'not found' })
  if (!(await verifyPassword(p.data.password, u.passwordHash)))
    return res.status(400).json({ error: 'Password is incorrect' })
  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecret: null, mfaRecoveryHashes: [] })
    .where(eq(users.id, u.id))
  await audit(u.id, 'mfa_disabled')
  res.json({ ok: true })
}
