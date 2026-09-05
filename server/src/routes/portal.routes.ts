import { Router } from 'express'
import { getPortalQuote, submitNegotiation, confirmPortal } from '../controllers/portal.controller.js'

// PUBLIC router — no requireAuth. Access is gated by the unguessable portal token.
const router = Router()

router.get('/:token', getPortalQuote)
router.post('/:token/negotiate', submitNegotiation)
router.post('/:token/confirm', confirmPortal)

export default router
