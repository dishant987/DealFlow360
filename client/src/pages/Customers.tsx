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

export default function Customers() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const isRep = user?.role === 'rep'
  const canManage = user?.role === 'manager' || user?.role === 'admin'
  const [scope, setScope] = useState<'mine' | 'all'>(isRep ? 'mine' : 'all')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', email: '', tier: 'bronze' })

  const list = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data as CustomerRow[],
  })
  const rows = useMemo(
    () => (list.data ?? []).filter((c) => scope === 'all' || c.ownerId === user?.id),
    [list.data, scope, user?.id],
  )

  const create = useMutation({
    mutationFn: async () => (await api.post('/config/customers', draft)).data as CustomerRow,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setCreating(false)
      setDraft({ name: '', email: '', tier: 'bronze' })
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>
              {isRep ? 'It will be yours, on the Bronze tier — a manager can change the tier.' : 'Add the details now or later.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField id="nc-name" label="Name">
              <Input id="nc-name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </FormField>
            <FormField id="nc-email" label="Email">
              <Input id="nc-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </FormField>
            {canManage && (
              <FormField id="nc-tier" label="Tier">
                <Select id="nc-tier" value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
                  {['bronze', 'silver', 'gold'].map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!draft.name.trim() || !draft.email.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Adding…' : 'Add customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
