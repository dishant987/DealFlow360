import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import GoogleButton from '@/components/GoogleButton'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CURRENCIES } from '@/lib/format'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().max(120).optional(),
  currency: z.string().length(3),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type Form = z.infer<typeof schema>

export default function Signup() {
  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { currency: 'USD' } })
  const nav = useNavigate()
  const qc = useQueryClient()
  // two short steps: about you, then your company
  const [step, setStep] = useState<1 | 2>(1)
  const next = async () => {
    if (await trigger(['name', 'email', 'password'])) setStep(2)
  }

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
      title={step === 1 ? 'Create your account' : 'Set up your company'}
      description={step === 1 ? 'Step 1 of 2 — about you.' : "Step 2 of 2 — you'll be its admin and can invite your team."}
    >
      <form
        onSubmit={step === 1 ? (e) => (e.preventDefault(), void next()) : handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-1 flex-1 rounded-full bg-primary" />
          <span className={`h-1 flex-1 rounded-full ${step === 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        <div className={step === 1 ? 'space-y-4' : 'hidden'}>
          <GoogleButton />
          <FormField id="name" label="Name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" autoFocus placeholder="Riya Rep" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>

          <FormField id="email" label="Work email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" placeholder="you@company.com" aria-invalid={!!errors.email} {...register('email')} />
          </FormField>

          <FormField id="password" label="Password" error={errors.password?.message}>
            <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
            {!errors.password && <p className="text-xs text-muted-foreground">At least 6 characters.</p>}
          </FormField>

          <Button type="submit" className="w-full">
            Continue
          </Button>
        </div>

        <div className={step === 2 ? 'space-y-4' : 'hidden'}>
          <FormField id="company" label="Company name">
            <Input id="company" autoComplete="organization" placeholder="Acme Inc." {...register('company')} />
          </FormField>

          <FormField id="currency" label="Currency">
            {/* every amount in the company is shown in this; an admin can change it later in Settings */}
            <Select id="currency" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>

          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Signing up creates a <strong className="font-medium text-foreground">new company</strong> with you as its
            admin. Joining a colleague's company? Ask their admin to invite you.
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            By creating an account you agree to the{' '}
            <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and{' '}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>

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
