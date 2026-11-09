import type { Request, Response } from 'express'
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import { db, runInTenant } from '../config/db.js'
import { appSettings, discountTiers, organizations, users } from '../models/schema.js'
import {
  hashPassword,
  verifyPassword,
  signToken,
  cookieName,
  cookieOpts,
  mfaCookieName,
  generateResetToken,
  hashResetToken,
} from '../utils/token.js'
import { sendPasswordReset } from '../utils/mailer.js'
import { currencySchema } from '../utils/format.js'
import { completeSignIn } from './mfa.controller.js'

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

// Self-signup starts a new company with the person as its admin; teammates are
// added by that admin (Config → Users) and join the same company.
const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  company: z.string().trim().min(1).max(120).optional(),
  currency: currencySchema.optional(),
})

/** A new company with the defaults the pricing engine needs (no tiers = every discount is over the limit). */
export async function createCompany(name: string, currency = 'USD') {
  const [org] = await db.insert(organizations).values({ name, currency }).returning()
  await runInTenant(org.id, async () => {
    await db.insert(appSettings).values({})
    await db.insert(discountTiers).values([
      { tier: 'bronze', maxDiscountPct: '5' },
      { tier: 'silver', maxDiscountPct: '10' },
      { tier: 'gold', maxDiscountPct: '15' },
    ])
  })
  return org
}
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(6) })

export async function signup(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { name, email, password } = parsed.data

  const existing = await db.select().from(users).where(eq(users.email, email))
  if (existing.length) return res.status(409).json({ error: 'email already registered' })

  const org = await createCompany(parsed.data.company || `${name}'s company`, parsed.data.currency)
  const [u] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), role: 'admin', organizationId: org.id })
    .returning()
  const token = signToken({ id: u.id, role: u.role, email: u.email })
  res
    .cookie(cookieName, token, cookieOpts)
    .status(201)
    .json({ id: u.id, name: u.name, email: u.email, role: u.role, currency: org.currency })
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { email, password } = parsed.data

  const [u] = await db.select().from(users).where(eq(users.email, email))
  if (!u || !(await verifyPassword(password, u.passwordHash)))
    return res.status(401).json({ error: 'invalid credentials' })
  // checked after the password, so a wrong guess never reveals the account is blocked
  if (u.blocked) return res.status(403).json({ error: 'This account is blocked. Contact your administrator.' })

  res.json(await completeSignIn(res, u))
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(cookieName).clearCookie(mfaCookieName).json({ ok: true })
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [u] = await db.select().from(users).where(eq(users.email, parsed.data.email))
  // act only if the user exists, but always return the same response (no user enumeration)
  if (u) {
    const { token, hash, expiresAt } = generateResetToken()
    await db
      .update(users)
      .set({ resetTokenHash: hash, resetTokenExpiresAt: expiresAt })
      .where(eq(users.id, u.id))
    await sendPasswordReset(u.email, `${CLIENT_URL}/reset-password?token=${token}`)
  }
  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' })
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [u] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.resetTokenHash, hashResetToken(parsed.data.token)),
        gt(users.resetTokenExpiresAt, new Date()),
      ),
    )
  if (!u) return res.status(400).json({ error: 'invalid or expired token' })

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.id, u.id))
  res.json({ ok: true })
}

/* ---- self-service profile: rename, and change your own password ----
   Separate from the admin user editor: this one proves you know the current
   password, and it can never change your own role. */
const updateMeSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6).optional(),
  })
  .refine((d) => !d.newPassword || !!d.currentPassword, {
    path: ['currentPassword'],
    message: 'Enter your current password to set a new one',
  })

export async function updateMe(req: Request, res: Response) {
  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { name, currentPassword, newPassword } = parsed.data

  const [u] = await db.select().from(users).where(eq(users.id, req.user!.id))
  if (!u) return res.status(404).json({ error: 'not found' })

  const patch: Partial<typeof users.$inferInsert> = {}
  if (name) patch.name = name
  if (newPassword) {
    if (!(await verifyPassword(currentPassword!, u.passwordHash)))
      return res.status(400).json({ error: 'Current password is incorrect' })
    patch.passwordHash = await hashPassword(newPassword)
  }
  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: 'Nothing to update' })

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, u.id))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
  res.json(updated)
}

export async function me(req: Request, res: Response) {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      mfaEnabled: users.mfaEnabled,
      currency: organizations.currency,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.id, req.user!.id))
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json(u)
}
