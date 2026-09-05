import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { getReport, exportReport, getReportFilters } from '../controllers/report.controller.js'

const router = Router()
router.use(requireAuth, requireRole('manager', 'finance', 'admin'))

router.get('/', getReport)
router.get('/filters', getReportFilters)
router.get('/export', exportReport)

export default router
