import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { pool } from './config/db.js'
import authRouter from './routes/auth.routes.js'
import configRouter from './routes/config.routes.js'
import quotationRouter from './routes/quotation.routes.js'
import approvalRouter from './routes/approval.routes.js'

export const app = express()
app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

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
