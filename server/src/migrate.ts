import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { poolFor } from './config/db.js'

// the owner login: the app's own login (DATABASE_URL) can't change tables
const pool = poolFor((process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL)!)
const db = drizzle(pool)

// Production migration runner: drizzle-kit is a dev tool, so the container applies
// the committed SQL in drizzle/ with drizzle-orm's own migrator before starting.
try {
  await migrate(db, { migrationsFolder: 'drizzle' })
  console.log('✔ migrations up to date')
} finally {
  await pool.end()
}
