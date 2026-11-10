import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { money } from '@/lib/format'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const METHODS = ['bank_transfer', 'card', 'upi', 'cash', 'cheque', 'other']
const LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', card: 'Card', upi: 'UPI', cash: 'Cash', cheque: 'Cheque', other: 'Other' }

/** Record all or part of what's owed on an invoice. */
export default function RecordPaymentDialog({
  invoiceId,
  balance,
  onDone,
  size = 'default',
}: {
  invoiceId: string
  balance: number
  onDone: () => void
  size?: 'default' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const n = Number(amount)
  const problem = !amount ? 'Enter an amount' : !(n > 0) ? 'Must be more than zero' : n > balance + 0.001 ? `More than the ${money(balance)} still owed` : null

  const pay = useMutation({
    mutationFn: () => api.post(`/invoices/${invoiceId}/pay`, { amount: n, method }),
    onSuccess: () => {
      toast.success(n >= balance ? 'Paid in full' : `Recorded ${money(n)} — ${money(balance - n)} still owed`)
      setOpen(false)
      onDone()
    },
    onError: (e) => toast.error(errText(e, 'Could not record the payment')),
  })

  return (
    <>
      <Button
        size={size}
        onClick={() => {
          setAmount(balance.toFixed(2))
          setOpen(true)
        }}
      >
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>{money(balance)} is still owed. Record all of it or part of it.</DialogDescription>
          </DialogHeader>
          <form
            id={`pay-${invoiceId}`}
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!problem) pay.mutate()
            }}
          >
            <FormField id={`pay-amount-${invoiceId}`} label="Amount" error={amount ? (problem ?? undefined) : undefined}>
              <Input id={`pay-amount-${invoiceId}`} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField id={`pay-method-${invoiceId}`} label="Method">
              <Select id={`pay-method-${invoiceId}`} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {LABEL[m]}
                  </option>
                ))}
              </Select>
            </FormField>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`pay-${invoiceId}`} disabled={!!problem || pay.isPending}>
              {pay.isPending ? 'Saving…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
