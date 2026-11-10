import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { CURRENCIES } from '@/lib/format'
import Panel from '@/components/Panel'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

// keep in step with INDUSTRIES in server/src/controllers/company.controller.ts
const INDUSTRIES = [
  'Manufacturing',
  'Wholesale & distribution',
  'Retail & e-commerce',
  'Software & IT',
  'Professional services',
  'Construction',
  'Healthcare',
  'Education',
  'Hospitality',
  'Logistics',
  'Other',
]

export type Company = {
  name: string
  currency: string
  industry: string | null
  website: string | null
  phone: string | null
  contactEmail: string | null
  address: string | null
  taxId: string | null
  defaultPaymentTermsDays: number
  quoteValidityDays: number
  defaultQuoteTerms: string | null
  paymentInstructions: string | null
}

export const useCompany = () =>
  useQuery({ queryKey: ['company'], queryFn: async () => (await api.get('/config/company')).data as Company })

const AREA = 'w-full rounded-md border bg-background px-3 py-2 text-sm'

/** Settings → Company (admins): who you are on invoices, your currency, and defaults for new work. */
export default function CompanySettings() {
  const q = useCompany()
  const qc = useQueryClient()
  const [f, setF] = useState<Company | null>(null)
  useEffect(() => {
    if (q.data) setF(q.data)
  }, [q.data])
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setF((x) => (x ? { ...x, [k]: e.target.value } : x))

  const save = useMutation({
    mutationFn: async () => (await api.patch('/config/company', { ...f, industry: f?.industry || null })).data as Company,
    onSuccess: (c) => {
      qc.setQueryData(['company'], c)
      void qc.invalidateQueries({ queryKey: ['me'] }) // the currency comes with the session
      toast.success('Company settings saved')
    },
    onError: (e) => toast.error(errText(e, 'Could not save')),
  })

  if (!f) return <Skeleton className="h-96 w-full" />
  const norm = (o: object | null | undefined) => JSON.stringify(Object.entries(o ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
  const dirty = norm(f) !== norm(q.data)
  const emailBad = !!f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())
  const nameMissing = !f.name.trim()

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Panel title="Company profile" description="Shown as the seller on every invoice.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="co-name" label="Company name" error={nameMissing ? 'Company name is required' : undefined}>
            <Input id="co-name" value={f.name} onChange={set('name')} required />
          </FormField>
          <FormField id="co-industry" label="Industry">
            <Select id="co-industry" value={f.industry ?? ''} onChange={set('industry')}>
              <option value="">Not set</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="co-email" label="Contact email" error={emailBad ? 'Enter a valid email' : undefined}>
            <Input id="co-email" type="email" value={f.contactEmail ?? ''} onChange={set('contactEmail')} placeholder="billing@yourcompany.com" />
          </FormField>
          <FormField id="co-phone" label="Phone">
            <Input id="co-phone" type="tel" value={f.phone ?? ''} onChange={set('phone')} />
          </FormField>
          <FormField id="co-website" label="Website">
            <Input id="co-website" value={f.website ?? ''} onChange={set('website')} placeholder="yourcompany.com" />
          </FormField>
          <FormField id="co-tax" label="Tax / VAT / GST ID">
            <Input id="co-tax" value={f.taxId ?? ''} onChange={set('taxId')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="co-address" label="Address">
              <textarea id="co-address" rows={3} className={AREA} value={f.address ?? ''} onChange={set('address')} />
            </FormField>
          </div>
        </div>
      </Panel>

      <Panel title="Regional" description="Every amount in the app, the customer portal and PDFs is shown in this currency.">
        <FormField id="co-currency" label="Currency">
          <Select id="co-currency" className="w-48" value={f.currency} onChange={set('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
      </Panel>

      <Panel title="Defaults for new work" description="Applied when something is created; each customer or quote can still be changed.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="co-terms-days" label="Payment terms for new customers (days)">
            <Input id="co-terms-days" type="number" min={0} max={365} value={f.defaultPaymentTermsDays} onChange={set('defaultPaymentTermsDays')} />
          </FormField>
          <FormField id="co-valid-days" label="New quotes are valid for (days)">
            <Input id="co-valid-days" type="number" min={1} max={365} value={f.quoteValidityDays} onChange={set('quoteValidityDays')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="co-quote-terms" label="Default terms & conditions on new quotes">
              <textarea id="co-quote-terms" rows={4} className={AREA} value={f.defaultQuoteTerms ?? ''} onChange={set('defaultQuoteTerms')} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField id="co-pay-instr" label="Payment instructions on invoices">
              <textarea
                id="co-pay-instr"
                rows={3}
                className={AREA}
                value={f.paymentInstructions ?? ''}
                onChange={set('paymentInstructions')}
                placeholder="e.g. Bank: … · Account: … · IFSC/SWIFT: …"
              />
            </FormField>
          </div>
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || emailBad || nameMissing || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save company settings'}
        </Button>
        {!dirty && <span className="text-sm text-muted-foreground">All changes saved</span>}
      </div>
    </form>
  )
}
