import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me,
  updateMe,
} from '../controllers/auth.controller.js'

const router = Router()

// Brute-force guard on the credential-taking endpoints (NOT /me or /logout —
// the app polls /me for the session, and a 429 there would read as a logout).
//
// Budget is per ACCOUNT per IP, not per IP alone. Keying on the IP by itself
// means one guesser — or one office behind a single NAT address — locks every
// colleague out of the product, because once the counter trips express-rate-limit
// refuses the valid logins too, not just the wrong ones. Keying on the targeted
// email confines the lockout to the account actually under attack, and the IP
// half stops an attacker resetting the budget by rotating addresses.
//
// Only failed attempts count, so signing in normally never spends the budget.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator normalises IPv6 into a /64 block, so an attacker cannot walk
  // a whole subnet one address at a time.
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'unknown'
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`
  },
  message: { error: 'Too many failed attempts. Please wait a few minutes and try again.' },
})

router.post('/signup', authLimiter, signup)
router.post('/login', authLimiter, login)
router.post('/forgot-password', authLimiter, forgotPassword)
router.post('/reset-password', authLimiter, resetPassword)
router.post('/logout', logout)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, updateMe)

export default router
