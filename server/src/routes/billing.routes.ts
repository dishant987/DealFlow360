import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  generateBilling,
  getBilling,
  changeSubscription,
  cancelSubscription,
  payInvoice,
} from '../controllers/billing.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/quotations/:id/billing', getBilling)
router.post('/quotations/:id/billing/generate', generateBilling)
router.post('/quotations/:id/billing/subscriptions/:lineId/change', changeSubscription)
router.post('/quotations/:id/billing/subscriptions/:lineId/cancel', cancelSubscription)
router.post('/invoices/:invoiceId/pay', payInvoice)

export default router
