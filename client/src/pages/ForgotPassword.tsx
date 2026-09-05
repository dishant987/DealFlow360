import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import FormField from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type Form = z.infer<typeof schema>

export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    // the request must not throw out of handleSubmit — an unhandled rejection
    // would leave the form stuck with no feedback at all
    try {
      await api.post('/auth/forgot-password', data)
      setSentTo(data.email)
    } catch (e) {
      toast.error(errText(e, 'Could not send the reset link'))
    }
  }

  if (sentTo)
    return (
      <AuthLayout title="Check your inbox" description="The link is valid for one hour.">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              If <span className="font-medium text-foreground">{sentTo}</span> matches an account,
              a reset link is on its way.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Nothing arrived? Check spam, or{' '}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="font-medium text-primary hover:underline"
            >
              try a different address
            </button>
            .
          </p>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout
      title="Forgot your password?"
      description="We'll email you a link to set a new one."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
