import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { FileSignature, GitCompare } from 'lucide-react'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { deviceName } from '@/lib/device'
import Panel from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

type Version = {
  version: number
  createdAt: string
  createdBy: string | null
  hash: string
  total: number
  lines: number
  signedName: string | null
  signedAt: string | null
  signedIp: string | null
  signedUserAgent: string | null
}
type Diff = {
  same: boolean
  fields: { field: string; label: string; from: unknown; to: unknown }[]
  added: { id: string; product: string; quantity: number }[]
  removed: { id: string; product: string; quantity: number }[]
  changed: { id: string; product: string; changes: { field: string; from: unknown; to: unknown }[] }[]
}

const LINE_LABEL: Record<string, string> = { quantity: 'Qty', unitPrice: 'Unit price', discountPct: 'Discount %', variantValue: 'Variant' }
const show = (v: unknown) => (v == null || v === '' ? '—' : String(v))

/** Every version the customer was sent, the one they signed, and what changed between two. */
export default function QuoteVersions({ quotationId }: { quotationId: string }) {
  const list = useQuery({
    queryKey: ['versions', quotationId],
    queryFn: async () => (await api.get(`/quotations/${quotationId}/versions`)).data as Version[],
  })
  const versions = list.data ?? []
  const [pair, setPair] = useState<{ from: number; to: number } | null>(null)
  const diff = useQuery({
    queryKey: ['versions-diff', quotationId, pair?.from, pair?.to],
    queryFn: async () => (await api.get(`/quotations/${quotationId}/versions/compare`, { params: pair })).data as Diff,
    enabled: !!pair,
  })
  if (!versions.length) return null
  const signed = versions.find((v) => v.signedAt)
  const from = pair?.from ?? versions[1]?.version ?? versions[0].version
  const to = pair?.to ?? versions[0].version

  return (
    <Panel title="Versions" description="A frozen copy each time it's sent to the customer. The signed one can't change.">
      {signed && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <FileSignature className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <p>
              Signed by <span className="font-[cursive] text-lg">{signed.signedName}</span> — version {signed.version},{' '}
              {format(new Date(signed.signedAt!), 'd MMM yyyy, HH:mm')}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {deviceName(signed.signedUserAgent)} · IP {signed.signedIp ?? 'unknown'} · fingerprint {signed.hash.slice(0, 12)}…
            </p>
          </div>
        </div>
      )}

      <ul className="divide-y text-sm" aria-label="Quote versions">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-medium">v{v.version}</span>
            <span className="text-muted-foreground">
              {format(new Date(v.createdAt), 'd MMM, HH:mm')} · {v.createdBy ?? 'customer'} · {v.lines} {v.lines === 1 ? 'line' : 'lines'}
            </span>
            {v.signedAt && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Signed</span>}
            <span className="ml-auto tabular-nums">{money(v.total)}</span>
          </li>
        ))}
      </ul>

      {versions.length > 1 && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <GitCompare className="size-4 text-muted-foreground" aria-hidden />
            Compare
            <Select aria-label="Compare from" value={from} onChange={(e) => setPair({ from: Number(e.target.value), to })}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </Select>
            with
            <Select aria-label="Compare to" value={to} onChange={(e) => setPair({ from, to: Number(e.target.value) })}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </Select>
            {!pair && <Button size="sm" variant="outline" onClick={() => setPair({ from, to })}>Show changes</Button>}
          </div>
          {diff.data &&
            (diff.data.same ? (
              <p className="text-sm text-muted-foreground">No differences.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" aria-label="Changes">
                {diff.data.fields.map((f) => (
                  <li key={f.field}>
                    <span className="text-muted-foreground">{f.label}:</span> <s className="text-muted-foreground">{show(f.field === 'total' ? money(Number(f.from)) : f.from)}</s> → {show(f.field === 'total' ? money(Number(f.to)) : f.to)}
                  </li>
                ))}
                {diff.data.added.map((l) => <li key={l.id} className="text-emerald-700 dark:text-emerald-400">+ Added {l.product} × {l.quantity}</li>)}
                {diff.data.removed.map((l) => <li key={l.id} className="text-red-700 dark:text-red-400">− Removed {l.product} × {l.quantity}</li>)}
                {diff.data.changed.map((c) => (
                  <li key={c.id}>
                    {c.product}:{' '}
                    {c.changes.map((x) => `${LINE_LABEL[x.field] ?? x.field} ${show(x.from)} → ${show(x.to)}`).join(', ')}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </Panel>
  )
}
