import { Router } from 'express'
import { requireAuth, requireRole, quotationAccessParam } from '../middlewares/auth.middleware.js'
import {
  getSuggestion,
  acceptSplit,
  getAllocations,
  consolidateBackorder,
} from '../controllers/fulfillment.controller.js'

const router = Router()
router.use(requireAuth)
// every :id below is a quotation — reps may only touch their own
router.param('id', quotationAccessParam)

// reps can view/track; finance/ops (and admin) make the split & backorder decisions
const ops = requireRole('finance', 'admin')

router.get('/:id/fulfillment/suggestion', getSuggestion)
router.get('/:id/fulfillment/allocations', getAllocations)
router.post('/:id/fulfillment/accept', ops, acceptSplit)
router.post('/:id/fulfillment/consolidate', ops, consolidateBackorder)

export default router
