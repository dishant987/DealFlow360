import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import {
  getSuggestion,
  acceptSplit,
  getAllocations,
  consolidateBackorder,
} from '../controllers/fulfillment.controller.js'

const router = Router()
router.use(requireAuth)

// reps can view/track; finance/ops (and admin) make the split & backorder decisions
const ops = requireRole('finance', 'admin')

router.get('/:id/fulfillment/suggestion', getSuggestion)
router.get('/:id/fulfillment/allocations', getAllocations)
router.post('/:id/fulfillment/accept', ops, acceptSplit)
router.post('/:id/fulfillment/consolidate', ops, consolidateBackorder)

export default router
