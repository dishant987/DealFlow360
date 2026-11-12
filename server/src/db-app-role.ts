import 'dotenv/config'
import { poolFor } from './config/db.js'

/*
 * Creates (or updates) the app's own database login. Run with the OWNER login
 * (MIGRATE_DATABASE_URL), after migrations:
 *
 *   APP_DB_PASSWORD=... npm run db:app-role
 *
 * The app then connects as this login via DATABASE_URL. It can read and write
 * rows but can't change tables and can't bypass row-level security, so one
 * company can never see another's data. Safe to re-run (rotates the password).
 */
const ownerUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL
const role = process.env.APP_DB_USER || 'dealwise_app'
const password = process.env.APP_DB_PASSWORD

if (!ownerUrl) throw new Error('Set MIGRATE_DATABASE_URL (the owner login).')
if (!password || password.length < 16) throw new Error('Set APP_DB_PASSWORD (at least 16 characters).')
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('APP_DB_USER must be a plain lowercase identifier.')

const pool = poolFor(ownerUrl)
const c = await pool.connect()
try {
  // DDL can't take bind parameters, so let Postgres quote the password itself
  const lit = (await c.query('select quote_literal($1::text) as q', [password])).rows[0].q as string
  const dbName = (await c.query('select current_database() as d')).rows[0].d as string
  await c.query('begin')
  await c.query(`do $$ begin
    if not exists (select from pg_roles where rolname = '${role}') then create role "${role}" login; end if;
  end $$`)
  // new roles start without superuser/bypassrls; hosted owners (Neon) may not set those flags, so check instead
  await c.query(`alter role "${role}" with login password ${lit}`)
  const [r] = (await c.query('select rolsuper, rolbypassrls from pg_roles where rolname = $1', [role])).rows
  if (r.rolsuper || r.rolbypassrls) throw new Error(`${role} can bypass row-level security; recreate it as a plain login`)
  await c.query(`grant connect on database "${dbName}" to "${role}"`)
  await c.query(`grant usage on schema public to "${role}"`)
  await c.query(`grant select, insert, update, delete on all tables in schema public to "${role}"`)
  await c.query(`grant usage, select, update on all sequences in schema public to "${role}"`)
  // tables and sequences that later migrations create (as this owner) get the same rights
  await c.query(`alter default privileges in schema public grant select, insert, update, delete on tables to "${role}"`)
  await c.query(`alter default privileges in schema public grant usage, select, update on sequences to "${role}"`)
  await c.query('commit')
  const u = new URL(ownerUrl)
  u.username = role
  u.password = '<APP_DB_PASSWORD>'
  console.log(`✔ ${role} is ready. Point the app at it:\n  DATABASE_URL=${u.toString()}`)
} catch (e) {
  await c.query('rollback').catch(() => {})
  console.error(`✖ ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  c.release()
  await pool.end()
}
