import type { Request, Response } from 'express'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { users } from '../models/schema.js'
import { cookieOpts, hashPassword } from '../utils/token.js'
import { completeSignIn } from './mfa.controller.js'
import { createCompany } from './auth.controller.js'

// Google sign-in with the OpenID Connect authorization-code flow, on fetch alone.
// The id_token comes straight from Google's token endpoint over TLS, which OIDC
// Core §3.1.3.7 accepts in place of a signature check; we still validate the claims.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const STATE_COOKIE = 'g_state'

const clientId = () => process.env.GOOGLE_CLIENT_ID
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET
const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')
// the client and API share an origin (Vite proxy in dev, reverse proxy in prod)
const redirectUri = () => `${clientUrl()}/api/auth/google/callback`

export type GoogleClaims = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean; name?: string }

/** The email to sign in as, or null when the token isn't for us, is expired, or the email is unverified. */
export function validateGoogleClaims(c: GoogleClaims, audience: string, nowSec = Date.now() / 1000): string | null {
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') return null
  if (c.aud !== audience) return null
  if (!c.exp || c.exp < nowSec) return null
  // linking by email is only safe when Google vouches for it
  if (c.email_verified !== true || !c.email) return null
  return c.email.toLowerCase()
}

export function providers(_req: Request, res: Response) {
  res.json({ google: !!(clientId() && clientSecret()) })
}

export function googleStart(_req: Request, res: Response) {
  if (!clientId() || !clientSecret()) return res.redirect(`${clientUrl()}/login?error=google_off`)
  const state = crypto.randomBytes(16).toString('hex')
  const q = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  res.cookie(STATE_COOKIE, state, { ...cookieOpts, maxAge: 10 * 60 * 1000 }).redirect(`${AUTH_URL}?${q}`)
}

export async function googleCallback(req: Request, res: Response) {
  const fail = (why: string) => res.clearCookie(STATE_COOKIE).redirect(`${clientUrl()}/login?error=${why}`)
  const { code, state } = req.query as { code?: string; state?: string }
  // state ties the callback to the browser that started it (CSRF)
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('google')

  let claims: GoogleClaims
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId()!,
        client_secret: clientSecret()!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    })
    if (!r.ok) return fail('google')
    const { id_token } = (await r.json()) as { id_token?: string }
    claims = JSON.parse(Buffer.from(String(id_token).split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return fail('google')
  }
  const email = validateGoogleClaims(claims, clientId()!)
  if (!email) return fail('google')

  let [u] = await db.select().from(users).where(eq(users.email, email))
  if (!u) {
    // same policy as self-signup: a new company with this person as its admin.
    // Random password; "Forgot password" sets a real one if they ever want it.
    const name = claims.name || email.split('@')[0]
    const org = await createCompany(`${name}'s company`)
    ;[u] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
        role: 'admin',
        organizationId: org.id,
      })
      .returning()
  }
  if (u.blocked) return fail('blocked')

  res.clearCookie(STATE_COOKIE)
  const result = await completeSignIn(res, u)
  res.redirect('mfaRequired' in result ? `${clientUrl()}/login?mfa=1` : `${clientUrl()}/`)
}
