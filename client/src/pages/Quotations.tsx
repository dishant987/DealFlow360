import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AppShell from '@/components/AppShell'
import DataTable, { type Column, type TableQuery } from '@/components/DataTable'
import KanbanBoard, { type Quote } from '@/components/KanbanBoard'
import { Plus, Trash2, X } from 'lucide-react'
import { errText } from '@/lib/errors'
import { Input } from '@/components/ui/input'
import ConfirmButton from '@/components/ConfirmButton'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import FormField from '@/components/FormField'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { humanize, money } from '@/lib/format'
import { Combobox } from '@/components/ui/combobox'
import { useDebounced } from '@/hooks/useDebounced'

type Customer = { id: string; name: string; tier: string }

const PAGE = 10
const STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'under_negotiation', 'confirmed', 'fulfilled', 'invoiced', 'rejected', 'cancelled']

export default function Quotations() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  // filters — applied to the table AND the kanban, so both views agree
  const [status, setStatus] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  // remembered per browser so the rep keeps their preferred view
  const [view, setView] = useState<'table' | 'kanban'>(
    () => (localStorage.getItem('quotations.view') as 'table' | 'kanban') ?? 'table',
  )
  const pickView = (v: 'table' | 'kanban') => {
    setView(v)
    localStorage.setItem('quotations.view', v)
  }

  // step 18: the server pages, searches, filters and sorts; only one page comes down
  const [tq, setTq] = useState<TableQuery>({ page: 1, search: '', sort: null })
  const filterParams = { status: status || undefined, customerId: customerFilter || undefined, flagged: flaggedOnly ? '1' : undefined }
  const quotes = useQuery({
    queryKey: ['quotations', 'page', tq, filterParams],
    queryFn: async () =>
      (
        await api.get('/quotations', {
          params: { ...filterParams, page: tq.page, pageSize: PAGE, q: tq.search || undefined, sort: tq.sort?.key, dir: tq.sort?.dir },
        })
      ).data as { rows: Quote[]; total: number },
    placeholderData: keepPreviousData,
    enabled: view === 'table',
  })
  const [boardSearch, setBoardSearch] = useState('')
  const boardQ = useDebounced(boardSearch.trim())
  const board = useQuery({
    queryKey: ['quotations', 'board', filterParams, boardQ],
    queryFn: async () =>
      (await api.get('/quotations/board', { params: { customerId: filterParams.customerId, flagged: filterParams.flagged, q: boardQ || undefined } })).data as {
        columns: { status: string; total: number; rows: Quote[] }[]
      },
    enabled: view === 'kanban',
  })
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data as Customer[],
  })

  const create = useMutation({
    mutationFn: async () => (await api.post('/quotations', { customerId })).data as { id: string },
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      setCreateOpen(false)
      setCustomerId('')
      nav(`/quotations/${q.id}`)
    },
    onError: () => toast.error('Could not create quotation'),
  })

  // reps add the customer they're quoting right here; the server starts it at bronze
  const [newCustomer, setNewCustomer] = useState<{ name: string; email: string } | null>(null)
  const addCustomer = useMutation({
    mutationFn: async (c: { name: string; email: string }) =>
      (await api.post('/config/customers', { ...c, tier: 'bronze' })).data as Customer,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setCustomerId(c.id)
      setNewCustomer(null)
      toast.success(`Added ${c.name}`)
    },
    onError: (e) => toast.error(errText(e, 'Could not add customer')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/quotations/${id}`)).data,
    onSuccess: (d: { deleted?: string }) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      toast.success(d.deleted ? `${d.deleted} deleted` : 'Draft deleted')
    },
    onError: (e) => toast.error(errText(e, 'Could not delete this quotation')),
  })

  const rows = quotes.data?.rows ?? []
  // the board shows the newest cards per column; a status filter narrows it to that column
  const boardCols = (board.data?.columns ?? []).filter((c) => !status || c.status === status)
  const boardCards = useMemo(() => boardCols.flatMap((c) => c.rows), [boardCols])
  const boardCounts = Object.fromEntries(boardCols.map((c) => [c.status, c.total]))
  const activeFilters = (status ? 1 : 0) + (customerFilter ? 1 : 0) + (flaggedOnly ? 1 : 0)
  const clearFilters = () => {
    setStatus('')
    setCustomerFilter('')
    setFlaggedOnly(false)
  }

  const columns: Column<Quote>[] = [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      sortKey: 'created',
      render: (r) => <span className="font-mono text-xs">{r.quoteNumber}</span>,
    },
    {
      key: 'customer',
      label: 'Customer',
      sortKey: 'customer',
      render: (r) => <span className="font-medium">{r.customer}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortKey: 'status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      value: (r) => r.amount,
      render: (r) => money(r.amount),
    },
    {
      key: 'riskScore',
      label: 'Risk',
      sortKey: 'risk',
      align: 'right',
      value: (r) => Number(r.riskScore),
      render: (r) => Number(r.riskScore).toFixed(1),
    },
    {
      key: 'updatedAt',
      label: 'Updated',
      sortKey: 'updated',
      value: (r) => new Date(r.updatedAt).getTime(),
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      // only drafts: everything further along has to be cancelled so its
      // history survives, which is what the server enforces too
      render: (r) =>
        r.status === 'draft' ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            title={`Delete ${r.quoteNumber}?`}
            description={`This permanently removes the draft for ${r.customer} and its lines. It cannot be undone.`}
            confirmLabel="Delete draft"
            onConfirm={() => remove.mutate(r.id)}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete draft</span>
          </ConfirmButton>
        ) : null,
    },
  ]

  const viewToggle = (
    <div className="inline-flex rounded-md border p-0.5">
      {(['table', 'kanban'] as const).map((v) => (
        <button
          key={v}
          onClick={() => pickView(v)}
          className={`px-3 py-1 text-sm rounded capitalize transition-colors ${
            view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )

  const newQuote = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="size-4" />
      New Quotation
    </Button>
  )

  const filters = (
    <>
      <Select
        aria-label="Filter by status"
        className="h-8 w-40 text-xs"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">All statuses</option>
        {STATUSES.map((v) => (
          <option key={v} value={v}>
            {humanize(v)}
          </option>
        ))}
      </Select>
      <Combobox
        aria-label="Filter by customer"
        className="h-8 w-44 text-xs"
        value={customerFilter}
        onChange={setCustomerFilter}
        clearLabel="All customers"
        placeholder="All customers"
        searchPlaceholder="Search customers…"
        options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Button
        size="sm"
        variant={flaggedOnly ? 'default' : 'outline'}
        aria-pressed={flaggedOnly}
        onClick={() => setFlaggedOnly((v) => !v)}
      >
        Over ceiling only
      </Button>
      {activeFilters > 0 && (
        <Button size="sm" variant="ghost" onClick={clearFilters}>
          <X className="size-3.5" />
          Clear {activeFilters}
        </Button>
      )}
    </>
  )

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New quotation</DialogTitle>
          <DialogDescription>
            Pick the customer this deal is for. Their tier sets the price list and the discount
            ceiling every line is judged against.
          </DialogDescription>
        </DialogHeader>
        <FormField id="new-quote-customer" label="Customer">
          <Combobox
            id="new-quote-customer"
            value={customerId}
            onChange={setCustomerId}
            placeholder="Select customer…"
            searchPlaceholder="Search customers…"
            loading={customers.isLoading}
            options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name, hint: humanize(c.tier) }))}
          />
        </FormField>
        {newCustomer ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <FormField id="new-customer-name" label="Customer name">
              <Input
                id="new-customer-name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              />
            </FormField>
            <FormField id="new-customer-email" label="Customer email">
              <Input
                id="new-customer-email"
                type="email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              New customers start on the Bronze tier; a manager can change it.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNewCustomer(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newCustomer.name.trim() || !newCustomer.email.trim() || addCustomer.isPending}
                onClick={() => addCustomer.mutate(newCustomer)}
              >
                {addCustomer.isPending ? 'Adding…' : 'Add customer'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="link" className="h-auto justify-start p-0" onClick={() => setNewCustomer({ name: '', email: '' })}>
            + New customer
          </Button>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!customerId || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create quotation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Quotations' }]}>
      {createDialog}
      {view === 'table' ? (
        <DataTable
          rows={rows}
          columns={columns}
          loading={quotes.isLoading}
          pageSize={PAGE}
          server={{ total: quotes.data?.total ?? 0, onChange: setTq }}
          resetPageOn={JSON.stringify(filterParams)}
          onRowClick={(r) => nav(`/quotations/${r.id}`)}
          searchPlaceholder="Search quote # or customer…"
          emptyMessage={
            activeFilters
              ? 'No quotation matches these filters.'
              : 'No quotations yet — create one to get started.'
          }
          toolbar={
            <>
              {newQuote}
              {filters}
              <div className="ml-auto">{viewToggle}</div>
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Search quotations"
              placeholder="Search quote # or customer…"
              className="w-56"
              value={boardSearch}
              onChange={(e) => setBoardSearch(e.target.value)}
            />
            {newQuote}
            {filters}
            <div className="ml-auto">{viewToggle}</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag a deal to move it forward — the system applies the right action and blocks moves
            that need approval or the customer.
          </p>
          <KanbanBoard quotes={boardCards} counts={boardCounts} loading={board.isLoading} />
        </div>
      )}
    </AppShell>
  )
}
