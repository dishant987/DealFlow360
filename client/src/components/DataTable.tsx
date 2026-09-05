import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
}

// debounce any fast-changing value (used for the search box)
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

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
}) {
  const [rawSearch, setRawSearch] = useState('')
  const search = useDebounced(rawSearch)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(1)

  const raw = (row: T, c: Column<T>) => (c.value ? c.value(row) : (row[c.key] ?? ''))

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => columns.some((c) => String(raw(r, c)).toLowerCase().includes(q)))
  }, [rows, columns, search])

  const sorted = useMemo(() => {
    if (!sort) return filtered
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
  }, [filtered, sort, columns])

  // keep the page in range when filtering/sorting shrinks the set
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])
  useEffect(() => {
    setPage(1)
  }, [search])

  const start = (page - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  const toggleSort = (c: Column<T>) => {
    if (c.sortable === false) return
    setSort((s) =>
      s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' },
    )
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
                  c.sortable === false ? '' : 'cursor-pointer select-none hover:text-foreground'
                }`}
              >
                {c.label}
                {sort?.key === c.key && <span className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
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

          {!loading && sorted.length === 0 && (
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

      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}
          </span>
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
        </div>
      )}
    </div>
  )
}
