import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { MailPlus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { ROLE_LABEL } from '@/lib/roles'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  role: z.enum(['rep', 'manager', 'finance', 'admin']),
})
type Form = z.infer<typeof schema>

/** Invite a teammate by email; they choose their own password from the link. */
export default function InviteDialog() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { role: 'rep' } })

  const onSubmit = async (data: Form) => {
    try {
      const { data: r } = await api.post('/config/users/invite', data)
      toast.success(r.resent ? `Sent a fresh invite to ${data.email}.` : `Invite sent to ${data.email}.`)
      void qc.invalidateQueries({ queryKey: ['/config/users'] })
      reset()
      setOpen(false)
    } catch (e) {
      toast.error(errText(e, "Couldn't send the invite"))
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MailPlus className="size-4" /> Invite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>They get an email to set a password and join your company. The link lasts 7 days.</DialogDescription>
          </DialogHeader>
          <form id="invite-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField id="invite-name" label="Name" error={errors.name?.message}>
              <Input id="invite-name" aria-invalid={!!errors.name} {...register('name')} />
            </FormField>
            <FormField id="invite-email" label="Email" error={errors.email?.message}>
              <Input id="invite-email" type="email" aria-invalid={!!errors.email} {...register('email')} />
            </FormField>
            <FormField id="invite-role" label="Role">
              <Select id="invite-role" {...register('role')}>
                {(Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </FormField>
          </form>
          <DialogFooter>
            <Button type="submit" form="invite-form" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
