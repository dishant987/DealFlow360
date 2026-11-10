import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { organizations } from '../models/schema.js'

// Money in the company's currency (PDFs, portal). Same rule as client/src/lib/format.ts.
const LOCALE: Record<string, string> = { INR: 'en-IN' } // lakh/crore grouping
export const money = (n: number | string | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency }).format(Number(n ?? 0))

/** Any real ISO 4217 code the runtime knows (USD, EUR, INR, AED, …). */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => Intl.supportedValuesOf('currency').includes(c), 'Unknown currency code')

/** The company's display currency (organizations isn't under RLS, so look it up by id). */
export async function orgCurrency(orgId: string | undefined) {
  if (!orgId) return 'USD'
  const [o] = await db.select({ c: organizations.currency }).from(organizations).where(eq(organizations.id, orgId))
  return o?.c ?? 'USD'
}

/**
 * Text for a spreadsheet cell: a leading = + - @ (or tab / CR) would make Excel run it as a
 * formula ("CSV injection"), so such values get a leading apostrophe and show as plain text.
 */
export const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

/** "pending_approval" → "Pending approval" */
export const humanize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : v)
