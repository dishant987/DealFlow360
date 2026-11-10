import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/roles'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import GoogleButton from '@/components/GoogleButton'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Form = z.infer<typeof schema>

// Internal testing only: the seeded roles, which all share the seed password.
// Shown in `npm run dev`, never in a production build unless an internal
// staging build opts in with VITE_SHOW_DEMO_LOGINS=true.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true'
const DEMO_ROLES = [
  { label: ROLE_LABEL.rep, email: 'rep@dealflow.com' },
  { label: ROLE_LABEL.manager, email: 'manager@dealflow.com' },
  { label: ROLE_LABEL.finance, email: 'finance@dealflow.com' },
  { label: ROLE_LABEL.admin, email: 'admin@dealflow.com' },
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

  const [params] = useSearchParams()
  // ?mfa=1 arrives from the Google redirect when the account has 2FA on
  const [mfaStep, setMfaStep] = useState(params.get('mfa') === '1')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const err = params.get('error')
    if (err === 'blocked') toast.error('This account is blocked. Contact your administrator.')
    else if (err === 'google') toast.error('Google sign-in did not complete. Please try again.')
    else if (err === 'google_off') toast.error('Google sign-in is not set up on this server.')
    if (params.get('reason') === 'idle') toast.info('You were signed out after 3 minutes without activity.', { id: 'idle' })
  }, [params])

  // seed the cache from the response so the protected route sees the user
  // immediately — invalidate alone only starts a background refetch and the
  // redirect would race it back to /login
  const signedIn = (user: unknown) => {
    qc.setQueryData(['me'], user)
    nav('/', { replace: true })
  }

  const onSubmit = async (data: Form) => {
    try {
      const { data: res } = await api.post('/auth/login', data)
      if (res.mfaRequired) setMfaStep(true)
      else signedIn(res)
    } catch (e) {
      toast.error(errText(e, 'Login failed'))
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    try {
      signedIn((await api.post('/auth/mfa/verify', { code })).data)
    } catch (err) {
      toast.error(errText(err, 'That code is not valid'))
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  if (mfaStep)
    return (
      <AuthLayout title="Two-factor authentication" description="Enter the 6-digit code from your authenticator app.">
        <form onSubmit={verify} className="space-y-4" noValidate>
          <FormField id="mfa-code" label="Authentication code">
            <Input
              id="mfa-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="text"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Lost your phone? Enter one of your recovery codes instead (like <code>a1b2c-3d4e5</code>).
          </p>
          <Button type="submit" className="w-full" disabled={verifying || code.trim().length < 6}>
            {verifying ? 'Verifying…' : 'Verify'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMfaStep(false)}>
            Back to sign in
          </Button>
        </form>
      </AuthLayout>
    )

  const fillDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Pick up your sales workspace where you left it."
      footer={
        SHOW_DEMO && (
        <div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            Try a demo account
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEMO_ROLES.map((r) => (
              <Button key={r.email} type="button" size="sm" variant="outline" className="text-xs" onClick={() => fillDemo(r.email)}>
                {r.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Fills the form. Password is <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>.
          </p>
        </div>
        )
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <GoogleButton />
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
