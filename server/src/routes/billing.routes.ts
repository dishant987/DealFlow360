import { Router } from 'express'
import { requireAuth, requireRole, quotationAccessParam } from '../middlewares/auth.middleware.js'
import {
  generateBilling,
  getBilling,
  changeSubscription,
  cancelSubscription,
  setSubscriptionPause,
  payInvoice,
} from '../controllers/billing.controller.js'

const router = Router()
router.use(requireAuth)
// every :id below is a quotation — reps may only touch their own
router.param('id', quotationAccessParam)

// reps can view; finance/ops (and admin) reconcile billing, proration, refunds, payments
const ops = requireRole('finance', 'admin')

router.get('/quotations/:id/billing', getBilling)
router.post('/quotations/:id/billing/generate', ops, generateBilling)
router.post('/quotations/:id/billing/subscriptions/:lineId/change', ops, changeSubscription)
router.post('/quotations/:id/billing/subscriptions/:lineId/cancel', ops, cancelSubscription)
router.post('/quotations/:id/billing/subscriptions/:lineId/pause', ops, setSubscriptionPause(true))
router.post('/quotations/:id/billing/subscriptions/:lineId/resume', ops, setSubscriptionPause(false))
router.post('/invoices/:invoiceId/pay', ops, payInvoice)

export default router
