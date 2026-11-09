import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormField from '@/components/FormField'
import PasswordInput from '@/components/PasswordInput'

type Step = { kind: 'idle' } | { kind: 'scan'; secret: string; qr: string } | { kind: 'codes'; codes: string[] } | { kind: 'disable' }

/** Profile → Security: turn authenticator-app 2FA on (with recovery codes) or off. */
export default function TwoFactorCard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const on = !!user?.mfaEnabled

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(errText(e, 'Something went wrong'))
    } finally {
      setBusy(false)
    }
  }
  const refreshMe = () => qc.invalidateQueries({ queryKey: ['me'] })

  const start = () =>
    run(async () => {
      const { secret, uri } = (await api.post('/auth/mfa/setup')).data as { secret: string; uri: string }
      setStep({ kind: 'scan', secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 192 }) })
      setCode('')
    })
  const enable = () =>
    run(async () => {
      const { recoveryCodes } = (await api.post('/auth/mfa/enable', { code })).data as { recoveryCodes: string[] }
      setStep({ kind: 'codes', codes: recoveryCodes })
      await refreshMe()
    })
  const disable = () =>
    run(async () => {
      await api.post('/auth/mfa/disable', { password })
      setStep({ kind: 'idle' })
      setPassword('')
      toast.success('Two-factor authentication is off')
      await refreshMe()
    })

  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading font-medium">Two-factor authentication</h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            on
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {on && <ShieldCheck className="size-3" aria-hidden />}
          {on ? 'On' : 'Off'}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) when you sign in.
      </p>

      {step.kind === 'idle' && !on && (
        <Button className="mt-4" onClick={start} disabled={busy}>
          Set up two-factor authentication
        </Button>
      )}
      {step.kind === 'idle' && on && (
        <Button className="mt-4" variant="outline" onClick={() => setStep({ kind: 'disable' })}>
          Turn off
        </Button>
      )}

      {step.kind === 'scan' && (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Scan this QR code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <img src={step.qr} alt="QR code for your authenticator app" className="size-48 rounded-lg border bg-white p-1" />
          <p className="text-xs text-muted-foreground">
            Can't scan? Enter this setup key instead:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono break-all" data-testid="mfa-secret">
              {step.secret}
            </code>
          </p>
          <FormField id="mfa-enable-code" label="6-digit code">
            <Input
              id="mfa-enable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-40 font-mono tracking-[0.3em]"
            />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={enable} disabled={busy || code.trim().length !== 6}>
              Turn on
            </Button>
            <Button variant="ghost" onClick={() => setStep({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'codes' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">Save your recovery codes</p>
          <p className="text-sm text-muted-foreground">
            Each code signs you in once if you lose your phone. They won't be shown again.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/40 p-3 font-mono text-sm" aria-label="Recovery codes">
            {step.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(step.codes.join('\n'))
                  .then(() => toast.success('Recovery codes copied'))
                  .catch(() => toast.error('Copy failed; select and copy them instead'))
              }
            >
              Copy codes
            </Button>
            <Button onClick={() => setStep({ kind: 'idle' })}>I've saved them</Button>
          </div>
        </div>
      )}

      {step.kind === 'disable' && (
        <div className="mt-4 space-y-3">
          <FormField id="mfa-disable-password" label="Confirm your password">
            <PasswordInput
              id="mfa-disable-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={disable} disabled={busy || !password}>
              Turn off two-factor
            </Button>
            <Button variant="ghost" onClick={() => setStep({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
