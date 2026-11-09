import 'dotenv/config'
import { createServer } from 'http'
import { app } from './app.js'
import { pool } from './config/db.js'
import { initSocket } from './config/socket.js'
import { startCron } from './services/cron.js'
import { prodEnvProblems } from './config/env.js'

const problems = prodEnvProblems()
if (problems.length) {
  for (const p of problems) console.error(`✖ ${p}`)
  process.exit(1)
}

const port = Number(process.env.PORT) || 4000
const server = createServer(app)
initSocket(server)

server.listen(port, async () => {
  console.log(`server on http://localhost:${port}`)
  try {
    await pool.query('SELECT 1')
    console.log('✔ database connected')
    // a login that skips row-level security would let companies see each other's data
    const [r] = (await pool.query(
      'select current_user as u, rolsuper or rolbypassrls as skips from pg_roles where rolname = current_user',
    )).rows
    if (r?.skips) {
      const msg = `DATABASE_URL logs in as "${r.u}", which bypasses row-level security, so company data is NOT isolated. Run \`npm run db:app-role\` and point DATABASE_URL at that login.`
      if (process.env.NODE_ENV === 'production') {
        console.error(`✖ ${msg}`)
        process.exit(1)
      }
      console.warn(`⚠ ${msg}`)
    }
    startCron()
  } catch (e) {
    console.error('✖ database connection failed:', (e as Error).message)
  }
})
