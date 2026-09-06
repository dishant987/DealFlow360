import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import { errText } from '@/lib/errors'
import { useAuth, type Role } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import Avatar from '@/components/Avatar'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// what each role may actually do, mirroring the guards the server enforces
const CAPABILITIES: Record<Role, string[]> = {
  rep: [
    'Build quotations, apply discounts and accept upsell suggestions',
    'Submit quotes for approval and send them to customers',
    'Track fulfilment and billing on your own deals',
  ],
  manager: [
    'First-level approval on quotations over the discount threshold',
    'Configure discount tiers, category ceilings and approval settings',
    'Monitor deal health, anomalies and reporting across the team',
  ],
  finance: [
    'Second-level approval on high-risk discounts',
    'Accept warehouse splits and resolve backorders',
    'Generate billing, record payments and reconcile subscriptions',
  ],
  admin: [
    'Full backend configuration: products, price lists, warehouses, plans',
    'Manage users and their roles',
    'Everything a manager and finance user can do',
  ],
}

const profileSchema = z.object({ name: z.string().min(1, 'Name cannot be empty') })
type ProfileForm = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(6, 'At least 6 characters'),
    confirm: z.string().min(1, 'Re-enter the new password'),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })
type PasswordForm = z.infer<typeof passwordSchema>

export default function Profile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [savedName, setSavedName] = useState(false)

  const profile = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '' },
  })
  const password = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  // clear the "saved" tick after a moment so it reads as feedback, not state
  useEffect(() => {
    if (!savedName) return
    const t = setTimeout(() => setSavedName(false), 2500)
    return () => clearTimeout(t)
  }, [savedName])

  const saveName = async (data: ProfileForm) => {
    try {
      const { data: updated } = await api.patch('/auth/me', { name: data.name })
      qc.setQueryData(['me'], updated)
      setSavedName(true)
    } catch (e) {
      toast.error(errText(e, 'Could not save your name'))
    }
  }

  const changePassword = async (data: PasswordForm) => {
    try {
      await api.patch('/auth/me', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
      password.reset()
      toast.success('Password updated')
    } catch (e) {
      toast.error(errText(e, 'Could not change your password'))
    }
  }

  const capabilities = user ? CAPABILITIES[user.role] : []

  return (
    <AppShell crumbs={[{ label: 'Workspace', to: '/' }, { label: 'Your profile' }]}>
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_21rem] lg:items-start">
        <div className="space-y-6">
          {/* identity */}
          <section className="rounded-xl border bg-background p-5">
            <div className="flex items-center gap-4">
              <Avatar name={user?.name} className="size-14 text-lg" />
              <div className="min-w-0">
                <h1 className="font-heading truncate text-lg font-medium">{user?.name}</h1>
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <form
              onSubmit={profile.handleSubmit(saveName)}
              className="mt-5 space-y-4 border-t pt-5"
              noValidate
            >
              <FormField id="name" label="Display name" error={profile.formState.errors.name?.message}>
                <Input
                  id="name"
                  autoComplete="name"
                  aria-invalid={!!profile.formState.errors.name}
                  {...profile.register('name')}
                />
              </FormField>

              <FormField id="email" label="Email">
                <Input id="email" value={user?.email ?? ''} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Your email is your sign-in identity — an administrator changes it for you.
                </p>
              </FormField>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={profile.formState.isSubmitting}>
                  {profile.formState.isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
                {savedName && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <Check className="size-4" /> Saved
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>

        {/* side column: role, then the password form */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-background p-5">
            <h2 className="font-heading font-medium">Change password</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              You'll stay signed in on this device.
            </p>
            <form
              onSubmit={password.handleSubmit(changePassword)}
              className="mt-4 space-y-4"
              noValidate
            >
              <FormField
                id="currentPassword"
                label="Current password"
                error={password.formState.errors.currentPassword?.message}
              >
                <PasswordInput
                  id="currentPassword"
                  autoComplete="current-password"
                  aria-invalid={!!password.formState.errors.currentPassword}
                  {...password.register('currentPassword')}
                />
              </FormField>
              <FormField
                id="newPassword"
                label="New password"
                error={password.formState.errors.newPassword?.message}
              >
                <PasswordInput
                  id="newPassword"
                  autoComplete="new-password"
                  aria-invalid={!!password.formState.errors.newPassword}
                  {...password.register('newPassword')}
                />
              </FormField>
              <FormField
                id="confirm"
                label="Confirm new password"
                error={password.formState.errors.confirm?.message}
              >
                <PasswordInput
                  id="confirm"
                  autoComplete="new-password"
                  aria-invalid={!!password.formState.errors.confirm}
                  {...password.register('confirm')}
                />
              </FormField>
              <Button type="submit" disabled={password.formState.isSubmitting}>
                {password.formState.isSubmitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </section>

          <section className="rounded-xl border bg-background p-5">
            <h2 className="font-heading font-medium">Your role</h2>
            <span className="mt-2 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium tracking-wide text-primary uppercase">
              {roleLabel(user?.role)}
            </span>
            <ul className="mt-4 space-y-2.5">
              {capabilities.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Roles are granted by an administrator under Config → Users.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
