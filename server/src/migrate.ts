import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './config/db.js'

// Production migration runner: drizzle-kit is a dev tool, so the container applies
// the committed SQL in drizzle/ with drizzle-orm's own migrator before starting.
try {
  await migrate(db, { migrationsFolder: 'drizzle' })
  console.log('✔ migrations up to date')
} finally {
  await pool.end()
}
