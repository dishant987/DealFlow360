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
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Form = z.infer<typeof schema>

// The seeded roles, so a reviewer can switch personas without hunting through
// the docs for credentials. They all share the seed password.
const DEMO_ROLES = [
  { label: 'Rep', email: 'rep@dealflow.com' },
  { label: 'Manager', email: 'manager@dealflow.com' },
  { label: 'Finance', email: 'finance@dealflow.com' },
  { label: 'Admin', email: 'admin@dealflow.com' },
]
const DEMO_PASSWORD = 'password123'

export default function Login() {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })
  const nav = useNavigate()
  const qc = useQueryClient()

  const onSubmit = async (data: Form) => {
    try {
      // seed the cache from the login response so the protected route sees the
      // user immediately — invalidate alone only starts a background refetch and
      // the redirect would race it back to /login
      const { data: user } = await api.post('/auth/login', data)
      qc.setQueryData(['me'], user)
      nav('/', { replace: true })
    } catch (e) {
      toast.error(errText(e, 'Login failed'))
    }
  }

  const fillDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Pick up your sales workspace where you left it."
      footer={
        <div className="rounded-lg border border-dashed bg-background/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">Demo accounts</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO_ROLES.map((r) => (
              <Button
                key={r.email}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => fillDemo(r.email)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Fills the form with that role. Password is{' '}
            <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>.
          </p>
        </div>
      }
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

        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          action={
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Forgot?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
