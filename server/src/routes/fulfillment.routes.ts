import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.middleware.js'
import {
  getSuggestion,
  acceptSplit,
  getAllocations,
  consolidateBackorder,
} from '../controllers/fulfillment.controller.js'

const router = Router()
router.use(requireAuth)

router.get('/:id/fulfillment/suggestion', getSuggestion)
router.get('/:id/fulfillment/allocations', getAllocations)
router.post('/:id/fulfillment/accept', acceptSplit)
router.post('/:id/fulfillment/consolidate', consolidateBackorder)

export default router
