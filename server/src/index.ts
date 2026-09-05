import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pool } from './db.js'

const app = express()
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(500).json({ status: 'ok', db: 'disconnected' })
  }
})

const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`server on http://localhost:${port}`))
