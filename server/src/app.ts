import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { pool } from './config/db.js'
import { emitChange } from './config/socket.js'
import authRouter from './routes/auth.routes.js'
import configRouter from './routes/config.routes.js'
import quotationRouter from './routes/quotation.routes.js'
import approvalRouter from './routes/approval.routes.js'
import fulfillmentRouter from './routes/fulfillment.routes.js'
import billingRouter from './routes/billing.routes.js'
import portalRouter from './routes/portal.routes.js'
import dashboardRouter from './routes/dashboard.routes.js'
import reportRouter from './routes/report.routes.js'
import opsRouter from './routes/ops.routes.js'

export const app = express()
app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

// A bodyless POST (axios.post(url) with no data) sends no Content-Type, so
// express.json() never runs and req.body stays undefined — which makes every
// zod safeParse fail with a confusing validation error. Normalise it.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {}
  next()
})

// broadcast every successful mutation so other sessions can refetch (live updates)
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) emitChange({ path: req.originalUrl, method: req.method })
    })
  }
  next()
})

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(500).json({ status: 'ok', db: 'disconnected' })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/config', configRouter)
// public portal FIRST — routers mounted at '/api' apply requireAuth to every path
// beneath it, which would 401 the customer before they ever reach the portal.
app.use('/api/portal', portalRouter)
app.use('/api', quotationRouter)
app.use('/api/approvals', approvalRouter)
app.use('/api/quotations', fulfillmentRouter)
app.use('/api', billingRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/reports', reportRouter)
app.use('/api', opsRouter)
