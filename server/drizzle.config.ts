import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/models/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // migrations run as the owner login; the app itself uses DATABASE_URL (no DDL rights)
  dbCredentials: { url: (process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL)! },
})
