import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import {
  listInvoices,
  getInvoice,
  listFulfillmentQueue,
  listSubscriptions,
  invoicePdf,
  getWorkspaceSummary,
} from '../controllers/ops.controller.js'
import { receiveStock } from '../controllers/fulfillment.controller.js'

// Cross-quotation operational views (mockup screens #7, #9, #12, #13).
// Read-only for any internal user; the actions still live on the detail screens
// and remain restricted to Finance/Ops.
const router = Router()
router.use(requireAuth)

router.get('/summary', getWorkspaceSummary)
router.get('/invoices', listInvoices)
router.get('/invoices/:id', getInvoice)
router.get('/invoices/:id/pdf', invoicePdf)
router.get('/fulfillment-queue', listFulfillmentQueue)
router.get('/subscriptions', listSubscriptions)

// A4: booking in a delivery against a warehouse's reorder rule. Same duty as
// accepting a split, so the same roles.
router.post('/stock/:stockId/receive', requireRole('finance', 'admin'), receiveStock)

export default router
