import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { humanize } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import DataTable, { type Column } from '@/components/DataTable'
import FormField from '@/components/FormField'
import ImportDialog from '@/components/ImportDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { useCompany } from '@/components/CompanySettings'

export type CustomerRow = {
  id: string
  name: string
  email: string
  tier: string
  phone: string | null
  paymentTermsDays: number
  ownerId: string | null
  ownerName: string | null
}

type Draft = {
  name: string
  email: string
  tier: string
  phone: string
  website: string
  taxId: string
  paymentTermsDays: string
  ownerId: string
  billingAddress: string
  shippingAddress: string
  notes: string
}
const BLANK: Draft = {
  name: '',
  email: '',
  tier: 'bronze',
  phone: '',
  website: '',
  taxId: '',
  paymentTermsDays: '', // blank = the company default (Settings → Company)
  ownerId: '',
  billingAddress: '',
  shippingAddress: '',
  notes: '',
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AREA = 'w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60'

export default function Customers() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const isRep = user?.role === 'rep'
  const canManage = user?.role === 'manager' || user?.role === 'admin'
  const [scope, setScope] = useState<'mine' | 'all'>(isRep ? 'mine' : 'all')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [sameAddress, setSameAddress] = useState(true)
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value })
  const emailBad = draft.email.trim() !== '' && !EMAIL.test(draft.email.trim())

  const list = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data as CustomerRow[],
  })
  const company = useCompany()
  const owners = useQuery({
    queryKey: ['report-filters'],
    queryFn: async () => (await api.get('/reports/filters')).data as { reps: { id: string; name: string }[] },
    enabled: canManage && creating,
  })
  const rows = useMemo(
    () => (list.data ?? []).filter((c) => scope === 'all' || c.ownerId === user?.id),
    [list.data, scope, user?.id],
  )

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { ...draft, paymentTermsDays: draft.paymentTermsDays === '' ? '' : Number(draft.paymentTermsDays) }
      if (sameAddress) body.shippingAddress = draft.billingAddress
      // blanks are simply not sent; reps can't pick the owner (the server enforces it too)
      for (const k of Object.keys(body)) if (body[k] === '') delete body[k]
      if (!canManage) delete body.ownerId
      return (await api.post('/config/customers', body)).data as CustomerRow
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setCreating(false)
      setDraft(BLANK)
      setSameAddress(true)
      nav(`/customers/${c.id}`)
    },
    onError: (e) => toast.error(errText(e, 'Could not add the customer')),
  })

  const columns: Column<CustomerRow>[] = [
    { key: 'name', label: 'Customer', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'email', label: 'Email' },
    { key: 'tier', label: 'Tier', render: (r) => humanize(r.tier) },
    { key: 'ownerName', label: 'Owner', render: (r) => r.ownerName ?? <span className="text-muted-foreground">—</span> },
    { key: 'paymentTermsDays', label: 'Terms', render: (r) => `Net ${r.paymentTermsDays}` },
  ]

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Customers' }]}>
      <div className="mb-4">
        <h1 className="font-heading text-xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          The accounts you sell to. {isRep ? 'You can edit the customers you own.' : 'Assign each one an owner.'}
        </p>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        loading={list.isLoading}
        onRowClick={(r) => nav(`/customers/${r.id}`)}
        searchPlaceholder="Search customers…"
        emptyMessage={scope === 'mine' ? "You don't own any customers yet." : 'No customers yet — add your first one.'}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Which customers" value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}>
              <option value="mine">My customers</option>
              <option value="all">All customers</option>
            </Select>
            {canManage && <ImportDialog kind="customers" endpoint="customers" />}
            {(canManage || isRep) && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> New customer
              </Button>
            )}
          </div>
        }
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>
              {isRep
                ? 'It will be yours, on the Bronze tier — a manager can change the tier.'
                : 'Only name and email are required; the rest can be filled in later.'}
            </DialogDescription>
          </DialogHeader>

          {/* scrolls inside the dialog on a phone */}
          <div className="-mx-1 max-h-[65svh] space-y-5 overflow-y-auto px-1">
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Company</legend>
              <FormField id="nc-name" label="Name">
                <Input id="nc-name" autoFocus value={draft.name} onChange={set('name')} />
              </FormField>
              <FormField id="nc-email" label="Email" error={emailBad ? 'Enter a valid email' : undefined}>
                <Input id="nc-email" type="email" aria-invalid={emailBad} value={draft.email} onChange={set('email')} />
              </FormField>
              <FormField id="nc-phone" label="Phone">
                <Input id="nc-phone" type="tel" value={draft.phone} onChange={set('phone')} />
              </FormField>
              <FormField id="nc-website" label="Website">
                <Input id="nc-website" placeholder="example.com" value={draft.website} onChange={set('website')} />
              </FormField>
              <FormField id="nc-tax" label="Tax / GST ID">
                <Input id="nc-tax" value={draft.taxId} onChange={set('taxId')} />
              </FormField>
              <FormField id="nc-terms" label="Payment terms (days)">
                <Input
                  id="nc-terms"
                  type="number"
                  min={0}
                  max={365}
                  value={draft.paymentTermsDays}
                  onChange={set('paymentTermsDays')}
                  placeholder={company.data ? `Company default: ${company.data.defaultPaymentTermsDays}` : undefined}
                />
              </FormField>
              {canManage && (
                <>
                  <FormField id="nc-tier" label="Tier">
                    <Select id="nc-tier" value={draft.tier} onChange={set('tier')}>
                      {['bronze', 'silver', 'gold'].map((t) => (
                        <option key={t} value={t}>
                          {humanize(t)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField id="nc-owner" label="Owner">
                    <Combobox
                      id="nc-owner"
                      value={draft.ownerId}
                      onChange={(v) => setDraft({ ...draft, ownerId: v })}
                      clearLabel="No owner"
                      placeholder="No owner"
                      searchPlaceholder="Search people…"
                      loading={owners.isLoading}
                      options={(owners.data?.reps ?? []).map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </FormField>
                </>
              )}
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Addresses</legend>
              <FormField id="nc-billing" label="Billing address">
                <textarea id="nc-billing" rows={3} className={AREA} value={draft.billingAddress} onChange={set('billingAddress')} />
              </FormField>
              <div className="space-y-1.5">
                <FormField id="nc-shipping" label="Shipping address">
                  <textarea
                    id="nc-shipping"
                    rows={3}
                    disabled={sameAddress}
                    className={AREA}
                    value={sameAddress ? draft.billingAddress : draft.shippingAddress}
                    onChange={set('shippingAddress')}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} /> Same as billing
                </label>
              </div>
            </fieldset>

            <FormField id="nc-notes" label="Notes">
              <textarea id="nc-notes" rows={2} className={AREA} value={draft.notes} onChange={set('notes')} />
            </FormField>
            <p className="text-xs text-muted-foreground">Add contact people on the customer's page once it's created.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!draft.name.trim() || !draft.email.trim() || emailBad || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Adding…' : 'Add customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
