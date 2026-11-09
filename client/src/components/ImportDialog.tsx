import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import StatusBadge from '@/components/StatusBadge'

type Kind = 'customers' | 'products'
type Planned = { row: number; action: 'create' | 'update' | 'skip' | 'error'; key: string; errors: string[] }
type Plan = { rows: Planned[]; summary: Record<Planned['action'], number> }

const LABEL: Record<Kind, string> = { customers: 'customers', products: 'products' }
const MATCH: Record<Kind, string> = { customers: 'email', products: 'SKU' }
const TONE = { create: 'approved', update: 'sent', skip: 'draft', error: 'rejected' } as const

// FileReader gives "data:<type>;base64,<payload>"; the API wants the payload only
const toBase64 = (f: File) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => fail(r.error)
    r.readAsDataURL(f)
  })

/** Bulk import for a Config tab: template → upload → preview every row → import all or nothing. */
export default function ImportDialog({ kind, endpoint }: { kind: Kind; endpoint: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'update' | 'skip'>('update')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setFile(null)
    setPlan(null)
  }
  const send = async (commit: boolean, f = file, m = mode) => {
    if (!f) return
    setBusy(true)
    try {
      const { data } = await api.post(`/config/import/${kind}`, {
        filename: f.name,
        data: await toBase64(f),
        mode: m,
        commit,
      })
      setPlan(data)
      if (commit) {
        const s = data.summary
        toast.success(`Imported: ${s.create} added, ${s.update} updated, ${s.skip} skipped`)
        qc.invalidateQueries({ queryKey: [endpoint] })
        qc.invalidateQueries({ queryKey: [kind] })
        setOpen(false)
        reset()
      }
    } catch (e) {
      toast.error(errText(e, 'Import failed'))
      setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  const s = plan?.summary
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Import
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import {LABEL[kind]}</DialogTitle>
            <DialogDescription>
              Upload a .csv or .xlsx file with a header row. Nothing is saved until you check the preview and press Import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <a
              href={`/api/config/import/${kind}/template`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Download className="size-4" /> Download the template
            </a>

            <div className="flex flex-wrap items-end gap-4">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">File</span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  aria-label="Spreadsheet file"
                  className="block text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setFile(f)
                    setPlan(null)
                    if (f) send(false, f)
                  }}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">When the {MATCH[kind]} already exists</span>
                <select
                  aria-label="When the record already exists"
                  value={mode}
                  onChange={(e) => {
                    const m = e.target.value as 'update' | 'skip'
                    setMode(m)
                    if (file) send(false, file, m)
                  }}
                  className="block h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="update">Update it</option>
                  <option value="skip">Skip the row</option>
                </select>
              </label>
            </div>

            {busy && !plan && <p className="text-sm text-muted-foreground">Reading the file…</p>}

            {plan && s && (
              <div className="space-y-2">
                <p className="text-sm" aria-live="polite">
                  <b>{s.create}</b> new · <b>{s.update}</b> to update · <b>{s.skip}</b> to skip ·{' '}
                  <b className={s.error ? 'text-destructive' : ''}>{s.error}</b> with errors
                </p>
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">{MATCH[kind]}</th>
                        <th className="px-3 py-2 font-medium">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.map((r) => (
                        <tr key={r.row} className="border-t align-top">
                          <td className="px-3 py-2 tabular-nums">{r.row}</td>
                          <td className="px-3 py-2">{r.key || '—'}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={TONE[r.action]} label={r.action === 'create' ? 'new' : r.action} />
                            {r.errors.length > 0 && (
                              <ul className="mt-1 list-disc pl-4 text-xs text-destructive">
                                {r.errors.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s.error > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Fix the rows with errors in your file and choose it again. Nothing is imported while any row has an error.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!plan || busy || !!s?.error || !(s && s.create + s.update)}
              onClick={() => send(true)}
            >
              {busy && plan ? 'Importing…' : s ? `Import ${s.create + s.update} ${LABEL[kind]}` : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
