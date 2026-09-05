import { Router } from 'express'
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '../db.js'
import { users } from '../schema.js'
import {
  hashPassword,
  verifyPassword,
  signToken,
  cookieName,
  cookieOpts,
  requireAuth,
  generateResetToken,
  hashResetToken,
} from '../auth.js'
import { sendPasswordReset } from '../mailer.js'

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

const router = Router()

// self-signup is always a rep; other roles are created by an admin (Phase 3)
const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
})
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { name, email, password } = parsed.data

  const existing = await db.select().from(users).where(eq(users.email, email))
  if (existing.length) return res.status(409).json({ error: 'email already registered' })

  const [u] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), role: 'rep' })
    .returning()
  const token = signToken({ id: u.id, role: u.role, email: u.email })
  res.cookie(cookieName, token, cookieOpts).status(201).json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  })
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  const { email, password } = parsed.data

  const [u] = await db.select().from(users).where(eq(users.email, email))
  if (!u || !(await verifyPassword(password, u.passwordHash)))
    return res.status(401).json({ error: 'invalid credentials' })

  const token = signToken({ id: u.id, role: u.role, email: u.email })
  res.cookie(cookieName, token, cookieOpts).json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  })
})

router.post('/logout', (_req, res) => {
  res.clearCookie(cookieName).json({ ok: true })
})

const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(6) })

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  const [u] = await db.select().from(users).where(eq(users.email, parsed.data.email))
  // only act if the user exists, but always return the same response (no user enumeration)
  if (u) {
    const { token, hash, expiresAt } = generateResetToken()
    await db
      .update(users)
      .set({ resetTokenHash: hash, resetTokenExpiresAt: expiresAt })
      .where(eq(users.id, u.id))
    await sendPasswordReset(u.email, `${CLIENT_URL}/reset-password?token=${token}`)
  }
  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' })
})

router.post('/reset-password', async (req, res) => {
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
})

router.get('/me', requireAuth, async (req, res) => {
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, req.user!.id))
  if (!u) return res.status(404).json({ error: 'not found' })
  res.json(u)
})

export default router
