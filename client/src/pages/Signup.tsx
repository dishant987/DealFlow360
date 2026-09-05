import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type Form = z.infer<typeof schema>

export default function Signup() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })
  const nav = useNavigate()
  const qc = useQueryClient()

  const onSubmit = async (data: Form) => {
    try {
      const { data: user } = await api.post('/auth/signup', data)
      qc.setQueryData(['me'], user)
      nav('/', { replace: true })
    } catch (e) {
      toast.error(errText(e, 'Signup failed'))
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Start building quotations in a couple of minutes."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField id="name" label="Name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            placeholder="Riya Rep"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
        </FormField>

        <FormField id="email" label="Work email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>

        <FormField id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {!errors.password && (
            <p className="text-xs text-muted-foreground">At least 6 characters.</p>
          )}
        </FormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Signing up creates a <strong className="font-medium text-foreground">sales rep</strong>{' '}
          account. Manager, finance and admin roles are granted by an administrator.
        </p>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
