import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  listInvoices,
  getInvoice,
  listFulfillmentQueue,
  listSubscriptions,
  invoicePdf,
} from '../controllers/ops.controller.js'

// Cross-quotation operational views (mockup screens #7, #9, #12, #13).
// Read-only for any internal user; the actions still live on the detail screens
// and remain restricted to Finance/Ops.
const router = Router()
router.use(requireAuth)

router.get('/invoices', listInvoices)
router.get('/invoices/:id', getInvoice)
router.get('/invoices/:id/pdf', invoicePdf)
router.get('/fulfillment-queue', listFulfillmentQueue)
router.get('/subscriptions', listSubscriptions)

export default router
