import { test, expect, request } from '@playwright/test'
import { API, PASSWORD } from './helpers'

// Settings → Company, in a fresh company so nothing shared changes.
test('company defaults apply to new customers and quotes, and only admins can change them', async () => {
  const t = Date.now()
  const admin = await request.newContext({ baseURL: API })
  await admin.post('/api/auth/signup', { data: { name: 'Co Owner', email: `co-${t}@example.com`, password: PASSWORD, company: `Co ${t}` } })
  expect((await admin.patch('/api/config/company', { data: { contactEmail: 'nope' } })).status()).toBe(400)
  const saved = await (
    await admin.patch('/api/config/company', {
      data: { industry: 'Logistics', currency: 'EUR', defaultPaymentTermsDays: 45, quoteValidityDays: 14, defaultQuoteTerms: 'Ex works.', taxId: 'VAT-1' },
    })
  ).json()
  expect(saved).toMatchObject({ industry: 'Logistics', currency: 'EUR', defaultPaymentTermsDays: 45, taxId: 'VAT-1' })
  expect((await (await admin.get('/api/auth/me')).json()).currency).toBe('EUR')

  const cust = await (await admin.post('/api/config/customers', { data: { name: 'Default Terms Ltd', email: `dt-${t}@example.com`, tier: 'gold' } })).json()
  expect(cust.paymentTermsDays).toBe(45)
  const q = await (await admin.post('/api/quotations', { data: { customerId: cust.id } })).json()
  expect(q.terms).toBe('Ex works.')
  expect(Math.round((new Date(q.validUntil).getTime() - Date.now()) / 86_400_000)).toBe(14)

  await admin.post('/api/config/users', { data: { name: 'Co Manager', email: `com-${t}@example.com`, password: PASSWORD, role: 'manager' } })
  const manager = await request.newContext({ baseURL: API })
  await manager.post('/api/auth/login', { data: { email: `com-${t}@example.com`, password: PASSWORD } })
  expect((await manager.get('/api/config/company')).status()).toBe(200)
  expect((await manager.patch('/api/config/company', { data: { name: 'Nope' } })).status()).toBe(403)
})
