import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { pool } from './db.js'
import authRouter from './routes/auth.js'

const app = express()
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

// throttle auth endpoints (public-facing, brute-force target)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 })
app.use('/api/auth', authLimiter, authRouter)

const port = Number(process.env.PORT) || 4000
app.listen(port, async () => {
  console.log(`server on http://localhost:${port}`)
  try {
    await pool.query('SELECT 1')
    console.log('✔ database connected')
  } catch (e) {
    console.error('✖ database connection failed:', (e as Error).message)
  }
})
