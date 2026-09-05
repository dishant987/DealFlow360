import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'
import DataTable, { type Column as DTColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

type Column = { key: string; label: string }

function errMsg(e: unknown, fallback: string) {
  const m = e instanceof AxiosError ? (e.response?.data?.error ?? fallback) : fallback
  return typeof m === 'string' ? m : fallback
}

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
}: {
  field: Field
  value: any
  onChange: (v: any) => void
}) {
  const options = useOptions(field)
  const isSelect = field.type === 'select'

  if (field.type === 'boolean')
    return (
      <label className="flex items-center gap-2 text-sm h-9">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )

  if (isSelect)
    return (
      <select
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{field.label}…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )

  return (
    <Input
      type={field.type === 'number' ? 'number' : 'text'}
      placeholder={field.label}
      value={value ?? ''}
      onChange={(e) =>
        onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
      }
      className="w-40"
    />
  )
}

export default function ResourceManager({
  title,
  endpoint,
  columns,
  fields,
}: {
  title: string
  endpoint: string
  columns: Column[]
  fields: Field[]
}) {
  const qc = useQueryClient()
  const blank = () => Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']))
  const [form, setForm] = useState<Record<string, any>>(blank)

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
      setForm(blank())
      toast.success(`${title} added`)
    },
    onError: (e) => toast.error(errMsg(e, 'Create failed')),
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
    ...columns.map((c) => ({ key: c.key, label: c.label })),
    {
      key: '__actions',
      label: '',
      sortable: false,
      render: (row: any) => (
        <Button size="sm" variant="ghost" onClick={() => remove.mutate(row.id)}>
          Delete
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        rows={list.data ?? []}
        columns={dtColumns}
        loading={list.isLoading}
        pageSize={8}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
        emptyMessage="No records yet."
      />

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {fields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={form[f.name]}
            onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
          />
        ))}
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          Add {title}
        </Button>
      </div>
    </div>
  )
}
