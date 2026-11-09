import 'dotenv/config'
import crypto from 'crypto'
import fs from 'fs'
import { poolFor } from './config/db.js'

const pool = poolFor((process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL)!)

/*
 * One-time switch from `db:push` to `db:migrate` for a database whose tables were
 * created by push. It records every migration in drizzle/ as already applied
 * (same rows drizzle-kit writes: sha256 of the file + the journal timestamp)
 * without running any SQL, so the next `db:migrate` only applies newer ones.
 * Only for a database whose schema already matches drizzle/ (e.g. kept up to date
 * with push). Refuses on an empty database (use db:migrate) and when nothing is missing.
 */
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
  entries: { tag: string; when: number }[]
}

const c = await pool.connect()
try {
  const hasTables = (await c.query(`select to_regclass('public.users') as t`)).rows[0].t
  if (!hasTables) throw new Error('No tables found: this is an empty database, run `npm run db:migrate` instead.')

  await c.query('create schema if not exists drizzle')
  await c.query(
    'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
  )
  // drizzle decides what to run by the newest recorded timestamp, so record
  // everything after it (a DB can have a partial history if migrate and push were mixed)
  const last = Number((await c.query('select coalesce(max(created_at), 0) as m from drizzle.__drizzle_migrations')).rows[0].m)
  const missing = journal.entries.filter((e) => e.when > last)
  if (!missing.length) throw new Error('Every migration is already recorded; nothing to baseline.')

  await c.query('begin')
  for (const e of missing) {
    const sql = fs.readFileSync(`drizzle/${e.tag}.sql`, 'utf8')
    const hash = crypto.createHash('sha256').update(sql).digest('hex')
    await c.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [hash, e.when])
  }
  await c.query('commit')
  console.log(`✔ recorded ${missing.map((e) => e.tag).join(', ')} as applied; from now on use \`npm run db:migrate\``)
} catch (err) {
  await c.query('rollback').catch(() => {})
  console.error(`✖ ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  c.release()
  await pool.end()
}
