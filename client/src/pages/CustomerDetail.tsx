import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { humanize, money } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import PageSkeleton from '@/components/PageSkeleton'
import StatusBadge from '@/components/StatusBadge'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type Contact = { id: string; name: string; email: string | null; phone: string | null; jobTitle: string | null; isPrimary: boolean }
type Customer = {
  id: string
  name: string
  email: string
  tier: string
  phone: string | null
  website: string | null
  billingAddress: string | null
  shippingAddress: string | null
  taxId: string | null
  paymentTermsDays: number
  notes: string | null
  ownerId: string | null
  ownerName: string | null
  contacts: Contact[]
}
type QuoteRow = { id: string; quoteNumber: string; customerId: string; status: string; amount: number; updatedAt: string }

const FIELDS: [keyof Customer, string, 'text' | 'area'][] = [
  ['name', 'Name', 'text'],
  ['email', 'Email', 'text'],
  ['phone', 'Phone', 'text'],
  ['website', 'Website', 'text'],
  ['taxId', 'Tax / GST ID', 'text'],
  ['billingAddress', 'Billing address', 'area'],
  ['shippingAddress', 'Shipping address', 'area'],
  ['notes', 'Notes', 'area'],
]

export default function CustomerDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const isRep = user?.role === 'rep'
  // managers and admins run every account; finance reads; reps edit their own
  const canManage = user?.role === 'manager' || user?.role === 'admin'

  const cust = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data as Customer,
  })
  // the quotations list is already scoped by role (reps see their own deals)
  const quotes = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => (await api.get('/quotations')).data as QuoteRow[],
  })
  const reps = useQuery({
    queryKey: ['report-filters'],
    queryFn: async () => (await api.get('/reports/filters')).data as { reps: { id: string; name: string }[] },
    enabled: canManage,
  })

  const [form, setForm] = useState<Partial<Customer>>({})
  useEffect(() => {
    if (cust.data) setForm(cust.data)
  }, [cust.data])
  const [person, setPerson] = useState({ name: '', email: '', phone: '', jobTitle: '' })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] })
    qc.invalidateQueries({ queryKey: ['customers'] })
  }
  const save = useMutation({
    mutationFn: async () => {
      const { contacts: _c, ownerName: _o, id: _i, ...rest } = form as Customer
      const body: Record<string, unknown> = { ...rest, paymentTermsDays: Number(rest.paymentTermsDays) }
      if (!canManage) {
        delete body.tier
        delete body.ownerId
      }
      delete (body as { createdAt?: unknown }).createdAt
      delete (body as { organizationId?: unknown }).organizationId
      return (await api.patch(`/config/customers/${id}`, body)).data
    },
    onSuccess: () => {
      refresh()
      toast.success('Customer saved')
    },
    onError: (e) => toast.error(errText(e, 'Could not save')),
  })
  const addContact = useMutation({
    mutationFn: async () => (await api.post(`/customers/${id}/contacts`, { ...person, isPrimary: !cust.data?.contacts.length })).data,
    onSuccess: () => {
      refresh()
      setPerson({ name: '', email: '', phone: '', jobTitle: '' })
    },
    onError: (e) => toast.error(errText(e, 'Could not add the contact')),
  })
  const contactAction = useMutation({
    mutationFn: async ({ cid, del }: { cid: string; del?: boolean }) =>
      del ? api.delete(`/contacts/${cid}`) : api.patch(`/contacts/${cid}`, { isPrimary: true }),
    onSuccess: refresh,
    onError: (e) => toast.error(errText(e, 'Could not update the contact')),
  })

  const crumbs = [
    { label: 'Workspace', to: '/' },
    { label: 'Customers', to: '/customers' },
  ]
  if (cust.isLoading)
    return (
      <AppShell crumbs={[...crumbs, { label: 'Loading…' }]}>
        <PageSkeleton />
      </AppShell>
    )
  if (!cust.data)
    return (
      <AppShell crumbs={[...crumbs, { label: 'Not found' }]}>
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <h1 className="font-heading text-lg font-semibold">Customer not found.</h1>
          <Link to="/customers" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Back to customers
          </Link>
        </div>
      </AppShell>
    )

  const c = cust.data
  const canEdit = canManage || (isRep && c.ownerId === user?.id)
  const theirQuotes = (quotes.data ?? []).filter((q) => q.customerId === c.id)

  return (
    <AppShell crumbs={[...crumbs, { label: c.name }]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {humanize(c.tier)} tier · Net {c.paymentTermsDays} · Owner: {c.ownerName ?? '—'}
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Read-only — owned by {c.ownerName ?? 'nobody'}</span>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-heading font-medium">Details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([key, label, kind]) => (
              <FormField key={key} id={`c-${key}`} label={label}>
                {kind === 'area' ? (
                  <textarea
                    id={`c-${key}`}
                    rows={3}
                    disabled={!canEdit}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
                    value={(form[key] as string) ?? ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                ) : (
                  <Input
                    id={`c-${key}`}
                    disabled={!canEdit}
                    value={(form[key] as string) ?? ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                )}
              </FormField>
            ))}
            <FormField id="c-terms" label="Payment terms (days)">
              <Input
                id="c-terms"
                type="number"
                min={0}
                disabled={!canEdit}
                value={form.paymentTermsDays ?? 30}
                onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })}
              />
            </FormField>
            {canManage && (
              <>
                <FormField id="c-tier" label="Tier">
                  <Select id="c-tier" value={form.tier ?? 'bronze'} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                    {['bronze', 'silver', 'gold'].map((t) => (
                      <option key={t} value={t}>
                        {humanize(t)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="c-owner" label="Owner">
                  <Select id="c-owner" value={form.ownerId ?? ''} onChange={(e) => setForm({ ...form, ownerId: e.target.value || null })}>
                    <option value="">No owner</option>
                    {(reps.data?.reps ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </>
            )}
          </div>
          {canEdit && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save customer'}
            </Button>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="font-heading font-medium">Contacts</h2>
            {c.contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts yet. Quote links go to {c.email}.</p>}
            <ul className="divide-y">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.isPrimary && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">Primary</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.jobTitle, p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      {!p.isPrimary && (
                        <Button size="icon" variant="ghost" title="Make primary" aria-label={`Make ${p.name} primary`} onClick={() => contactAction.mutate({ cid: p.id })}>
                          <Star className="size-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => contactAction.mutate({ cid: p.id, del: true })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {c.contacts.some((p) => p.isPrimary) && (
              <p className="text-xs text-muted-foreground">Quote links are emailed to the primary contact.</p>
            )}
            {canEdit && (
              <div className="space-y-2 border-t pt-3">
                <Input aria-label="Contact name" placeholder="Name" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
                <Input aria-label="Contact email" placeholder="Email" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label="Contact phone" placeholder="Phone" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
                  <Input aria-label="Contact job title" placeholder="Job title" value={person.jobTitle} onChange={(e) => setPerson({ ...person, jobTitle: e.target.value })} />
                </div>
                <Button size="sm" variant="outline" disabled={!person.name.trim() || addContact.isPending} onClick={() => addContact.mutate()}>
                  Add contact
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-xl border bg-card p-5">
            <h2 className="font-heading font-medium">Quotations</h2>
            {theirQuotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isRep ? 'You have no quotations for this customer.' : 'No quotations yet.'}</p>
            ) : (
              <ul className="divide-y text-sm">
                {theirQuotes.slice(0, 10).map((q) => (
                  <li key={q.id}>
                    <button type="button" onClick={() => nav(`/quotations/${q.id}`)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-primary">
                      <span className="font-mono text-xs">{q.quoteNumber}</span>
                      <StatusBadge status={q.status} />
                      <span className="tabular-nums">{money(q.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
