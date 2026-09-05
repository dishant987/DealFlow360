import { Router } from 'express'
// import rateLimit from 'express-rate-limit' // re-enable with the limiter below
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me,
} from '../controllers/auth.controller.js'

const router = Router()

// Throttle only the credential-taking endpoints (brute-force targets).
// NOT /me or /logout — the app polls /me for the session and a 429 there would
// look like a logout to the client.
// TEMPORARILY DISABLED for development/demo — re-enable before going live by
// uncommenting the limiter and adding `authLimiter` back to the four routes.
// const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 })

router.post('/signup', signup)
router.post('/login', login)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/logout', logout)
router.get('/me', requireAuth, me)

export default router
