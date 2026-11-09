import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { errText } from '@/lib/errors'
import AuthLayout from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'

/** Landing page for the link in the confirmation email. */
export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const qc = useQueryClient()
  const [state, setState] = useState<{ ok: boolean; error?: string } | null>(null)
  const sent = useRef(false) // StrictMode runs effects twice in dev

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState({ ok: true })
        void qc.invalidateQueries({ queryKey: ['me'] })
      })
      .catch((e) => setState({ ok: false, error: errText(e, 'This link is invalid or has expired.') }))
  }, [token, qc])

  if (!state) return <AuthLayout title="Confirming your email…" description="One moment.">{null}</AuthLayout>
  return state.ok ? (
    <AuthLayout title="Email confirmed" description="Thanks — your address is verified.">
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> You can close this tab or carry on.
        </p>
        <Button className="w-full" asChild>
          <Link to="/">Go to Dealwise</Link>
        </Button>
      </div>
    </AuthLayout>
  ) : (
    <AuthLayout title="Link not valid" description="We couldn't confirm your email with this link.">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm text-muted-foreground">{state.error} Sign in and use “Send it again” at the top of the page.</p>
        </div>
        <Button className="w-full" asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
