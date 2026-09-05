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

export const app = express()
app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

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
app.use('/api', quotationRouter)
app.use('/api/approvals', approvalRouter)
app.use('/api/quotations', fulfillmentRouter)
app.use('/api', billingRouter)
app.use('/api/portal', portalRouter) // public, token-gated customer view
app.use('/api/dashboard', dashboardRouter)
app.use('/api/reports', reportRouter)
