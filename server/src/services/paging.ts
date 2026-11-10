// Server-side paging for list endpoints (step 18). Pure: turns query params into safe values.

export const MAX_PAGE_SIZE = 100

/** Read ?page, ?pageSize, ?sort, ?dir, ?q. Unknown sorts fall back to the default; sizes are clamped. */
export function parsePaging<S extends string>(
  query: Record<string, unknown>,
  sorts: readonly S[],
  fallback: { sort: S; dir: 'asc' | 'desc' },
) {
  const int = (v: unknown, d: number) => {
    const n = Number.parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) ? n : d
  }
  const page = Math.max(1, int(query.page, 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, int(query.pageSize, 25)))
  const sort = (sorts as readonly string[]).includes(String(query.sort)) ? (query.sort as S) : fallback.sort
  const dir = query.dir === 'asc' || query.dir === 'desc' ? query.dir : fallback.dir
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  return { page, pageSize, offset: (page - 1) * pageSize, sort, dir, q }
}

/** "QT-2026-0042", "INV-2026-42" or "42" → 42; anything else → null (then only names are searched). */
export function seqFromSearch(q: string): number | null {
  const m = q.match(/(?:^|-)0*(\d{1,9})$/)
  return m ? Number(m[1]) : null
}

/** Wrap user text for ILIKE so % and _ are matched literally. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
