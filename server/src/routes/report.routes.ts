import { Router } from 'express'
import { requireAuth, requireFeature, requireRole } from '../middlewares/auth.middleware.js'
import { getReport, exportReport, getReportFilters } from '../controllers/report.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'))

router.get('/', requireFeature('reports'), getReport)
// not gated: the customer screens use it for their owner pickers
router.get('/filters', getReportFilters)
router.get('/export', requireFeature('reports'), exportReport)

export default router
