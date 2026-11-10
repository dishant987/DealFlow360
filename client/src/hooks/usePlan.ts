import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Feature = 'fulfilment' | 'subscriptions' | 'import' | 'upsell' | 'reports' | 'dealHealth'

export type Plan = {
  plan: 'trial' | 'starter' | 'growth' | 'scale'
  trialDaysLeft: number | null
  readOnly: boolean
  features: Feature[]
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  hasSubscription: boolean
  seats: number
  prices: { starter: number; growth: number; scale: number }
  billingReady: boolean
}

/** The company's Dealwise plan (trial, Starter, Growth) — drives the trial banner and Growth-only screens. */
export function usePlan(enabled = true) {
  return useQuery({
    queryKey: ['plan'],
    queryFn: async () => (await api.get('/plan')).data as Plan,
    enabled,
    staleTime: 60_000,
  })
}
