import 'dotenv/config'
import { AsyncLocalStorage } from 'async_hooks'
import type { Response } from 'express'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../models/schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example)')

// Local Postgres needs no SSL; hosted providers ask for it via ?sslmode=require.
const verifyCert = process.env.DB_SSL_ALLOW_SELF_SIGNED !== 'true'
export const poolFor = (url: string) =>
  new Pool({
    connectionString: url,
    ...(/sslmode=require/i.test(url) ? { ssl: { rejectUnauthorized: verifyCert } } : {}),
  })

// DATABASE_URL is the app's own login. It must NOT be a superuser or owner with
// BYPASSRLS, or row-level security (one company never sees another's rows) is skipped.
export const pool = poolFor(connectionString)
const baseDb = drizzle(pool, { schema })
type Db = typeof baseDb
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/*
 * Company scope. Each scoped unit of work runs in one transaction whose
 * app.org_id is the company; RLS policies (migration 0006) filter every
 * company table by it, and new rows take it as their organization_id default.
 * `db` resolves to the current scope's transaction, so query code is unchanged.
 */
const scope = new AsyncLocalStorage<{ tx: Tx; orgId: string | null }>()

export const db = new Proxy(baseDb, {
  get(target, prop) {
    const t = scope.getStore()?.tx ?? target
    const v = Reflect.get(t, prop, t)
    return typeof v === 'function' ? v.bind(t) : v
  },
}) as Db

export const currentOrgId = () => scope.getStore()?.orgId ?? null

/** Run fn as `orgId`. bypass is for server-internal jobs only (cron, seed, token lookups). */
export function runInTenant<T>(orgId: string | null, fn: () => Promise<T>, opts: { bypass?: boolean } = {}) {
  return baseDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${orgId ?? ''}, true), set_config('app.rls_bypass', ${opts.bypass ? 'on' : 'off'}, true)`,
    )
    return scope.run({ tx, orgId }, fn)
  })
}

class Rollback extends Error {}

/**
 * Express helper: run the rest of this request as `orgId`. The transaction
 * commits when the response has been sent, and rolls back on a 5xx or if the
 * client disconnects first. A request already in scope just continues.
 * shortcut: the commit happens after the response is sent, so a failed commit isn't reported to the client; move to explicit transactions if that ever matters
 */
export function scopeRequest(orgId: string, res: Response, next: () => void) {
  if (scope.getStore()) return next()
  runInTenant(orgId, () => {
    return new Promise<void>((resolve, reject) => {
      res.once('finish', () => (res.statusCode >= 500 ? reject(new Rollback()) : resolve()))
      res.once('close', () => (res.writableFinished ? undefined : reject(new Rollback())))
      next()
    })
  }).catch((e) => {
    if (e instanceof Rollback) return
    console.error('[tenant] transaction failed:', (e as Error).message)
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server. Please try again.' })
  })
}
