import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { getDealHealth, alertAction } from '../controllers/dashboard.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'))

router.get('/', getDealHealth)
router.post('/quotations/:id/nudge', alertAction('nudge'))
router.post('/quotations/:id/escalate', alertAction('escalate'))

export default router
