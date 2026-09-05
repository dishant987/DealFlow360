/**
 * Turn a Postgres driver error into something a person can act on.
 *
 * Without this the raw error — SQL text, parameters and a stack — goes straight
 * back to the browser, which is both unreadable and more than a client should
 * ever see about the schema.
 */

// column names as they read to someone using the admin screens
const FIELD_LABELS: Record<string, string> = {
  category_id: 'category',
  product_id: 'product',
  suggested_product_id: 'suggested product',
  warehouse_id: 'warehouse',
  quotation_id: 'quotation',
  tier: 'tier',
  sku: 'SKU',
  email: 'email',
  name: 'name',
}

const label = (column: string) =>
  FIELD_LABELS[column] ?? column.replace(/_id$/, '').replace(/_/g, ' ')

interface PgError {
  code?: string
  detail?: string
  column?: string
  constraint?: string
  cause?: unknown
}

/** Drizzle wraps driver failures in a DrizzleQueryError, so the pg error with the
 *  SQLSTATE code sits on .cause rather than on the thrown object itself. */
function pgErrorOf(e: unknown): PgError | null {
  let current = e as PgError | null
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current.code === 'string') return current
    current = current.cause as PgError | null
  }
  return null
}

export function friendlyDbError(e: unknown): { status: number; error: string } | null {
  const err = pgErrorOf(e)
  switch (err?.code) {
    case '23505': {
      // detail looks like: Key (category_id)=(abc-123) already exists.
      const columns = /Key \(([^)]+)\)=/.exec(err.detail ?? '')?.[1]
      const what = columns?.split(', ').map(label).join(' and ')
      return {
        status: 409,
        error: what
          ? `A record with that ${what} already exists — edit the existing one instead of adding another.`
          : 'That record already exists.',
      }
    }
    case '23503': {
      // 23503 covers both directions, and they need opposite advice:
      //   "is still referenced from table X"  -> you are deleting a parent in use
      //   "is not present in table X"         -> you are pointing at a missing parent
      const stillUsed = /is still referenced from table "([^"]+)"/.exec(err.detail ?? '')
      if (stillUsed)
        return {
          status: 409,
          error: `This is still used by existing ${stillUsed[1].replace(/_/g, ' ')} — remove or reassign those first.`,
        }
      return {
        status: 400,
        error: 'That refers to a record which no longer exists. Refresh and try again.',
      }
    }
    case '23502':
      return {
        status: 400,
        error: `${err.column ? label(err.column) : 'A required field'} is required.`,
      }
    case '23514':
      return { status: 400, error: 'That value is outside the range this field allows.' }
    case '22P02':
    case '22003':
      return { status: 400, error: 'One of the values is not a valid number or format.' }
    default:
      return null
  }
}
