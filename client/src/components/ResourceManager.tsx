import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import DataTable, { type Column as DTColumn } from '@/components/DataTable'
import Panel from '@/components/Panel'
import FormField from '@/components/FormField'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import ConfirmButton from '@/components/ConfirmButton'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export type Field = {
  name: string
  label: string
  type?: 'text' | 'number' | 'boolean' | 'select'
  options?: { label: string; value: string }[] // static options
  optionsFrom?: string // endpoint returning rows for a select
  optionLabel?: string // row field to show (default 'name')
  optionValue?: string // row field for value (default 'id')
  default?: string | number | boolean
}

type Column = {
  key: string
  label: string
  /** custom cell rendering, passed straight through to DataTable */
  render?: (row: any) => ReactNode
}

const errMsg = (e: unknown, fallback: string) => errText(e, fallback)

function useOptions(field: Field) {
  const q = useQuery({
    queryKey: [field.optionsFrom],
    queryFn: async () => (await api.get(field.optionsFrom!)).data as any[],
    enabled: !!field.optionsFrom,
  })
  if (field.options) return field.options
  return (q.data ?? []).map((r) => ({
    label: String(r[field.optionLabel ?? 'name']),
    value: String(r[field.optionValue ?? 'id']),
  }))
}

function FieldInput({
  field,
  value,
  onChange,
  id,
}: {
  field: Field
  value: any
  onChange: (v: any) => void
  id?: string
}) {
  const options = useOptions(field)
  const isSelect = field.type === 'select'

  if (field.type === 'boolean')
    return (
      <label className="flex h-9 items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    )

  if (isSelect)
    return (
      <Select
        id={id}
        className="w-full"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{field.label}…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    )

  return (
    <Input
      id={id}
      type={field.type === 'number' ? 'number' : 'text'}
      placeholder={field.label}
      value={value ?? ''}
      onChange={(e) =>
        onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
      }
    />
  )
}

export default function ResourceManager({
  title,
  plural,
  description,
  endpoint,
  columns,
  fields,
  rowActions,
}: {
  title: string
  /** plural heading; defaults to title + "s", which is wrong for "Category" */
  plural?: string
  /** one line explaining what this tab configures and what it affects */
  description?: string
  endpoint: string
  columns: Column[]
  fields: Field[]
  /** extra per-row buttons, rendered before Edit/Delete */
  rowActions?: (row: any) => ReactNode
}) {
  const qc = useQueryClient()
  const heading = plural ?? `${title}s`
  const blank = () => Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']))
  const [form, setForm] = useState<Record<string, any>>(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const startEdit = (row: any) => {
    setEditingId(row.id)
    setForm(Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? ''])))
    setOpen(true)
  }
  const startCreate = () => {
    setEditingId(null)
    setForm(blank())
    setOpen(true)
  }
  const closeDialog = () => {
    setOpen(false)
    setEditingId(null)
    setForm(blank())
  }

  const list = useQuery({
    queryKey: [endpoint],
    queryFn: async () => (await api.get(endpoint)).data as any[],
  })

  const create = useMutation({
    mutationFn: async () => {
      // strip empty optional fields
      const body: Record<string, any> = {}
      for (const [k, v] of Object.entries(form)) if (v !== '' && v !== undefined) body[k] = v
      return (await api.post(endpoint, body)).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoint] })
      closeDialog()
      toast.success(`${title} added`)
    },
    onError: (e) => toast.error(errMsg(e, 'Create failed')),
  })

  const update = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {}
      for (const [k, v] of Object.entries(form)) if (v !== '' && v !== undefined) body[k] = v
      return (await api.patch(`${endpoint}/${editingId}`, body)).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoint] })
      closeDialog()
      toast.success(`${title} updated`)
    },
    onError: (e) => toast.error(errMsg(e, 'Update failed')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`${endpoint}/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoint] })
      toast.success(`${title} deleted`)
    },
    onError: (e) => toast.error(errMsg(e, 'Delete failed')),
  })

  const dtColumns: DTColumn<any>[] = [
    ...columns.map((c) => ({ key: c.key, label: c.label, render: c.render })),
    {
      key: '__actions',
      label: '',
      sortable: false,
      render: (row: any) => (
        <div className="flex items-center justify-end gap-0.5">
          {rowActions?.(row)}
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title={`Edit this ${title.toLowerCase()}`}
            onClick={() => startEdit(row)}
          >
            <Pencil className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="px-2 text-muted-foreground hover:text-destructive"
            title={`Delete this ${title.toLowerCase()}?`}
            description="This cannot be undone."
            onConfirm={() => remove.mutate(row.id)}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete</span>
          </ConfirmButton>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Panel
        title={heading}
        description={description}
        bodyClassName="pt-0"
        className="[&>header]:pb-2"
        action={
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" /> Add {title.toLowerCase()}
          </Button>
        }
      >
        <DataTable
          rows={list.data ?? []}
          columns={dtColumns}
          loading={list.isLoading}
          pageSize={8}
          searchPlaceholder={`Search ${title.toLowerCase()}…`}
          emptyMessage={`No ${heading.toLowerCase()} yet — add the first one below.`}
        />
      </Panel>

      {/* Editing used to scroll the page to a form pinned under the table, which
          on a long list meant losing sight of the row being edited. */}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Edit ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Change what you need and save. Nothing is written until you do.'
                : description}
            </DialogDescription>
          </DialogHeader>

          <form
            id="resource-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (editingId) update.mutate()
              else create.mutate()
            }}
          >
            {fields.map((f) =>
              f.type === 'boolean' ? (
                <div key={f.name} className="sm:col-span-2">
                  <FieldInput
                    id={f.name}
                    field={f}
                    value={form[f.name]}
                    onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                  />
                </div>
              ) : (
                <FormField key={f.name} id={f.name} label={f.label}>
                  <FieldInput
                    id={f.name}
                    field={f}
                    value={form[f.name]}
                    onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                  />
                </FormField>
              ),
            )}
          </form>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="resource-form"
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : `Add ${title.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
