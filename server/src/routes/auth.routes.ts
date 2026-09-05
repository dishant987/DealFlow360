import { Router } from 'express'
import rateLimit from 'express-rate-limit'
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

// throttle auth endpoints (public-facing, brute-force target)
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }))

router.post('/signup', signup)
router.post('/login', login)
router.post('/logout', logout)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', requireAuth, me)

export default router
