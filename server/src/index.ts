import 'dotenv/config'
import { app } from './app.js'
import { pool } from './config/db.js'
import { startCron } from './services/cron.js'

const port = Number(process.env.PORT) || 4000
app.listen(port, async () => {
  console.log(`server on http://localhost:${port}`)
  try {
    await pool.query('SELECT 1')
    console.log('✔ database connected')
    startCron()
  } catch (e) {
    console.error('✖ database connection failed:', (e as Error).message)
  }
})
