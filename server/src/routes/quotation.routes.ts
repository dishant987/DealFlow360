import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  listQuotations,
  getQuotation,
  createQuotation,
  updateQuotation,
  submitQuotation,
  sendToCustomer,
  listNegotiations,
  getUpsell,
  addLine,
  updateLine,
  deleteLine,
} from '../controllers/quotation.controller.js'
import { listCustomers, listProducts } from '../controllers/catalog.controller.js'

const router = Router()
router.use(requireAuth) // any authenticated internal user

// catalog (rep workspace)
router.get('/customers', listCustomers)
router.get('/products', listProducts)

// quotations
router.get('/quotations', listQuotations)
router.post('/quotations', createQuotation)
router.get('/quotations/:id', getQuotation)
router.patch('/quotations/:id', updateQuotation)
router.post('/quotations/:id/submit', submitQuotation)
router.post('/quotations/:id/send', sendToCustomer)
router.get('/quotations/:id/negotiations', listNegotiations)
router.get('/quotations/:id/upsell', getUpsell)
router.post('/quotations/:id/lines', addLine)
router.patch('/quotations/:id/lines/:lineId', updateLine)
router.delete('/quotations/:id/lines/:lineId', deleteLine)

export default router
