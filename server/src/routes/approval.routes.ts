import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import {
  listApprovals,
  getApprovalDetail,
  actOnApproval,
} from '../controllers/approval.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'))

router.get('/', listApprovals)
router.get('/:id', getApprovalDetail)
router.post('/:id/action', actOnApproval)

export default router
