import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { billingPortal, paymentHistory, choosePlan, confirmCheckout, getPlan, resumePlan } from '../controllers/plan.controller.js'

// Dealwise's own subscription. The Stripe webhook is mounted in app.ts (it needs the raw body).
const router = Router()
router.use(requireAuth)
router.get('/', getPlan)
router.post('/checkout', requireRole('admin'), choosePlan)
router.post('/portal', requireRole('admin'), billingPortal)
router.post('/resume', requireRole('admin'), resumePlan)
router.get('/history', requireRole('admin'), paymentHistory)
router.post('/confirm', requireRole('admin'), confirmCheckout)

export default router
