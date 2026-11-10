import { Router } from 'express'
import { requireAuth, requireFeature, requireRole } from '../middlewares/auth.middleware.js'
import { getDealHealth, alertAction } from '../controllers/dashboard.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'), requireFeature('dealHealth'))

router.get('/', getDealHealth)
router.post('/quotations/:id/nudge', alertAction('nudge'))
router.post('/quotations/:id/escalate', alertAction('escalate'))

export default router
