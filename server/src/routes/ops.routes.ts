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
const router = Router()
router.use(requireAuth)

// The workspace summary is already scoped per role inside the handler — a rep
// gets their own deals counted, everyone else gets the pipeline.
router.get('/summary', getWorkspaceSummary)

// Everything below spans EVERY rep's deals: other customers, their amounts and
// their outstanding balances. A rep is scoped to their own deals everywhere else
// (quotationAccessParam, listQuotations), so these must not be the one hole that
// hands them the whole book. The nav never offered a rep these screens either.
const crossPipeline = requireRole('manager', 'finance', 'admin')

router.get('/invoices', crossPipeline, listInvoices)
router.get('/invoices/:id', crossPipeline, getInvoice)
router.get('/invoices/:id/pdf', crossPipeline, invoicePdf)
router.get('/fulfillment-queue', crossPipeline, listFulfillmentQueue)
router.get('/subscriptions', crossPipeline, listSubscriptions)

// A4: booking in a delivery against a warehouse's reorder rule. Same duty as
// accepting a split, so the same roles.
router.post('/stock/:stockId/receive', requireRole('finance', 'admin'), receiveStock)

export default router
