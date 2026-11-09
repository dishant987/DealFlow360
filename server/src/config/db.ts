import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../models/schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)')

// Local Postgres needs no SSL; hosted providers ask for it via ?sslmode=require.
const needsSsl = /sslmode=require/i.test(connectionString)
// Verify the server certificate unless explicitly told the provider uses a self-signed one.
const verifyCert = process.env.DB_SSL_ALLOW_SELF_SIGNED !== 'true'

export const pool = new Pool({
  connectionString,
  ...(needsSsl ? { ssl: { rejectUnauthorized: verifyCert } } : {}),
})
export const db = drizzle(pool, { schema })
