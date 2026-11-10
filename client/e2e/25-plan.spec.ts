import { test, expect, request } from '@playwright/test'
import { API, PASSWORD } from './helpers'

// Step 17. The trial clock and read-only rules are unit-tested (server/src/services/plan.test.ts).
test('a new company starts a 14-day trial of every feature; only admins can buy, and not before Stripe is set up', async () => {
  const t = Date.now()
  const admin = await request.newContext({ baseURL: API })
  expect((await admin.post('/api/auth/signup', { data: { name: 'Plan Owner', email: `plan-${t}@example.com`, password: PASSWORD, company: `Plan Co ${t}` } })).status()).toBe(201)
  const plan = await (await admin.get('/api/plan')).json()
  expect(plan).toMatchObject({ plan: 'trial', trialDaysLeft: 14, readOnly: false, features: ['fulfilment', 'subscriptions', 'import', 'upsell', 'reports', 'dealHealth'], seats: 1 })
  expect((await admin.get('/api/reports')).status()).toBe(200) // the trial includes Scale

  await admin.post('/api/config/users', { data: { name: 'Plan Rep', email: `plan-rep-${t}@example.com`, password: PASSWORD, role: 'rep' } })
  const rep = await request.newContext({ baseURL: API })
  await rep.post('/api/auth/login', { data: { email: `plan-rep-${t}@example.com`, password: PASSWORD } })
  expect((await rep.post('/api/plan/checkout', { data: { plan: 'growth' } })).status()).toBe(403)
  // CI has no Stripe key: the admin gets a clear "not set up" instead of a crash
  if (!plan.billingReady) expect((await admin.post('/api/plan/checkout', { data: { plan: 'growth' } })).status()).toBe(503)
})
