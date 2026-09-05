import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'

const schema = z
  .object({
    password: z.string().min(6, 'At least 6 characters'),
    confirm: z.string().min(1, 'Re-enter the password'),
  })
  // catching a typo here is the whole point — the token is single use, so a
  // mistyped password means requesting another link
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })
type Form = z.infer<typeof schema>

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const nav = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    try {
      await api.post('/auth/reset-password', { token, password: data.password })
      toast.success('Password updated — please sign in.')
      nav('/login', { replace: true })
    } catch (e) {
      toast.error(errText(e, 'Reset failed'))
    }
  }

  if (!token)
    return (
      <AuthLayout title="Link not valid" description="This reset link is missing its token.">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Reset links expire after an hour and can only be used once. Request a fresh one and
              open it from the newest email.
            </p>
          </div>
          <Button className="w-full" asChild>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title="Set a new password" description="Choose something you haven't used before.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField id="password" label="New password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>

        <FormField id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...register('confirm')}
          />
        </FormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Reset password'}
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
