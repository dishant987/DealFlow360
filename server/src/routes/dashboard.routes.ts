import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { getDealHealth, nudge } from '../controllers/dashboard.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'))

router.get('/', getDealHealth)
router.post('/quotations/:id/nudge', nudge)

export default router
