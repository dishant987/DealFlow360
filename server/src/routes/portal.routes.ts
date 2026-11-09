import { Router } from 'express'
import { getPortalQuote, submitNegotiation, confirmPortal, portalScope } from '../controllers/portal.controller.js'

// PUBLIC router — no requireAuth. Access is gated by the unguessable portal token.
const router = Router()
// each request runs inside the company that owns the quote behind the token
router.param('token', portalScope)

router.get('/:token', getPortalQuote)
router.post('/:token/negotiate', submitNegotiation)
router.post('/:token/confirm', confirmPortal)

export default router
