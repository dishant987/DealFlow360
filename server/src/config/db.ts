import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../models/schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)')

// Local Postgres needs no SSL; hosted providers ask for it via ?sslmode=require.
const needsSsl = /sslmode=require/i.test(connectionString)

export const pool = new Pool({
  connectionString,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
})
export const db = drizzle(pool, { schema })
