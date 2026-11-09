import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export type QuoteDetailFields = {
  id: string
  customerId: string
  validUntil: string | null
  contactId: string | null
  customerPo: string | null
  paymentTermsDays: number
  notesToCustomer: string | null
  terms: string | null
  internalNotes: string | null
}

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const area = 'w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60'

/**
 * The quote's terms: who it's for, how long it's valid, payment terms, notes and T&C.
 * Customer-facing fields follow the cart lock (draft/rejected only); internal notes are always editable.
 */
export default function QuoteDetails({ quote, canEdit }: { quote: QuoteDetailFields; canEdit: boolean }) {
  const qc = useQueryClient()
  const [f, setF] = useState(quote)
  useEffect(() => setF(quote), [quote])
  const contacts = useQuery({
    queryKey: ['customer', quote.customerId],
    queryFn: async () => (await api.get(`/customers/${quote.customerId}`)).data as { contacts: { id: string; name: string; email: string | null }[] },
  })
  const expired = !!f.validUntil && new Date(f.validUntil) < new Date()

  const save = useMutation({
    mutationFn: async () => {
      const body = canEdit
        ? {
            validUntil: f.validUntil || null,
            contactId: f.contactId || null,
            customerPo: f.customerPo || null,
            paymentTermsDays: Number(f.paymentTermsDays),
            notesToCustomer: f.notesToCustomer || null,
            terms: f.terms || null,
            internalNotes: f.internalNotes || null,
          }
        : { internalNotes: f.internalNotes || null }
      return (await api.patch(`/quotations/${quote.id}`, body)).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', quote.id] })
      toast.success('Quote details saved')
    },
    onError: (e) => toast.error(errText(e, 'Could not save the details')),
  })

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="Quote details">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium">Quote details</h2>
        {expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">Expired</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="qd-valid" label="Valid until">
          <Input
            id="qd-valid"
            type="date"
            disabled={!canEdit}
            value={dateInput(f.validUntil)}
            onChange={(e) => setF({ ...f, validUntil: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </FormField>
        <FormField id="qd-contact" label="Addressed to">
          <Select id="qd-contact" disabled={!canEdit} value={f.contactId ?? ''} onChange={(e) => setF({ ...f, contactId: e.target.value || null })}>
            <option value="">The customer's email</option>
            {(contacts.data?.contacts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` — ${c.email}` : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="qd-po" label="Customer PO number">
          <Input id="qd-po" disabled={!canEdit} value={f.customerPo ?? ''} onChange={(e) => setF({ ...f, customerPo: e.target.value })} />
        </FormField>
        <FormField id="qd-terms-days" label="Payment terms (days)">
          <Input
            id="qd-terms-days"
            type="number"
            min={0}
            disabled={!canEdit}
            value={f.paymentTermsDays}
            onChange={(e) => setF({ ...f, paymentTermsDays: Number(e.target.value) })}
          />
        </FormField>
      </div>
      <FormField id="qd-notes" label="Notes to the customer">
        <textarea id="qd-notes" rows={2} disabled={!canEdit} className={area} value={f.notesToCustomer ?? ''} onChange={(e) => setF({ ...f, notesToCustomer: e.target.value })} />
      </FormField>
      <FormField id="qd-tc" label="Terms & conditions">
        <textarea id="qd-tc" rows={3} disabled={!canEdit} className={area} value={f.terms ?? ''} onChange={(e) => setF({ ...f, terms: e.target.value })} />
      </FormField>
      <FormField id="qd-internal" label="Internal notes (never shown to the customer)">
        <textarea id="qd-internal" rows={2} className={area} value={f.internalNotes ?? ''} onChange={(e) => setF({ ...f, internalNotes: e.target.value })} />
      </FormField>
      <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save details'}
      </Button>
    </section>
  )
}
