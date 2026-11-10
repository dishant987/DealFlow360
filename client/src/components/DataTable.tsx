import { useDebounced } from '@/hooks/useDebounced'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SearchX } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type Column<T> = {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  /** raw value used for sorting + searching (defaults to row[key]) */
  value?: (row: T) => string | number
  /** custom cell rendering (defaults to the raw value) */
  render?: (row: T) => ReactNode
  /** server mode: the sort name the API understands; columns without one can't be sorted */
  sortKey?: string
}

export type TableQuery = { page: number; search: string; sort: { key: string; dir: 'asc' | 'desc' } | null }


export default function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  loading = false,
  pageSize = 10,
  searchable = true,
  searchPlaceholder = 'Search…',
  onRowClick,
  emptyMessage = 'No records found.',
  toolbar,
  server,
  resetPageOn,
}: {
  rows: T[]
  columns: Column<T>[]
  loading?: boolean
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  toolbar?: ReactNode
  /**
   * Server-side paging (step 18): `rows` is just the current page and `total` the full count.
   * The table keeps page / debounced search / sort and reports every change through onChange.
   */
  server?: { total: number; onChange: (q: TableQuery) => void }
  /** back to page 1 whenever this changes (e.g. filters outside the table) */
  resetPageOn?: unknown
}) {
  const [rawSearch, setRawSearch] = useState('')
  const search = useDebounced(rawSearch)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(1)

  const raw = (row: T, c: Column<T>) => (c.value ? c.value(row) : (row[c.key] ?? ''))

  const isServer = !!server
  const filtered = useMemo(() => {
    if (isServer || !search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => columns.some((c) => String(raw(r, c)).toLowerCase().includes(q)))
  }, [rows, columns, search, isServer])

  const sorted = useMemo(() => {
    if (isServer || !sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const av = raw(a, col)
      const bv = raw(b, col)
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, columns, isServer])

  const total = server ? server.total : sorted.length
  // keep the page in range when filtering/sorting shrinks the set
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])
  useEffect(() => {
    setPage(1)
  }, [search, resetPageOn])

  // server mode: tell the page what to fetch whenever page, search or sort change
  const onChange = useRef(server?.onChange)
  onChange.current = server?.onChange
  useEffect(() => {
    onChange.current?.({ page, search: search.trim(), sort })
  }, [page, search, sort])

  const start = (page - 1) * pageSize
  const pageRows = isServer ? rows : sorted.slice(start, start + pageSize)

  const sortKeyOf = (c: Column<T>) => (isServer ? c.sortKey : c.sortable === false ? undefined : c.key)
  const toggleSort = (c: Column<T>) => {
    const key = sortKeyOf(c)
    if (!key) return
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <Input
              className="w-64"
              placeholder={searchPlaceholder}
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
            />
          )}
          {toolbar}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                onClick={() => toggleSort(c)}
                className={`${c.align === 'right' ? 'text-right' : ''} ${
                  sortKeyOf(c) ? 'cursor-pointer select-none hover:text-foreground' : ''
                }`}
                aria-sort={sort && sortKeyOf(c) && sort.key === sortKeyOf(c) ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {c.label}
                {sort && sortKeyOf(c) && sort.key === sortKeyOf(c) && <span className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading &&
            pageRows.map((row, i) => (
              <TableRow
                key={row.id ?? i}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer' : ''}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                    {c.render ? c.render(row) : String(raw(row, c))}
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading && total === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length}>
                <div className="flex flex-col items-center gap-1 py-10 text-center">
                  <SearchX className="size-6 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {/* distinguish "there is nothing" from "your filter hid it" */}
                    {search ? `No matches for "${search}".` : emptyMessage}
                  </p>
                  {search && (
                    <Button size="sm" variant="ghost" onClick={() => setRawSearch('')}>
                      Clear search
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* the count always shows; the pager only when there's more than one page */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {start + 1}–{Math.min(start + pageSize, total)} of {total}
          </span>
          {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            <span className="text-muted-foreground">
              {page} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page === pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
          )}
        </div>
      )}
    </div>
  )
}
