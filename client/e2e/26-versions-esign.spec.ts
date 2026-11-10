import { test, expect, request } from '@playwright/test'
import { API, SIGN, apiAs } from './helpers'

// Step 26: every send freezes a version; the customer signs the exact version they accept.
test('sending saves a version, the customer signs what they accept, and the change is comparable', async () => {
  const rep = await apiAs('rep')
  const gold = (await (await rep.get('/api/customers')).json()).find((c: { tier: string }) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const laptop = (await (await rep.get('/api/products')).json()).find((p: { name: string }) => p.name === 'Business Laptop')
  await rep.post(`/api/quotations/${q.id}/lines`, { data: { productId: laptop.id, quantity: 2, discountPct: 0 } })
  await rep.post(`/api/quotations/${q.id}/submit`)
  await rep.post(`/api/quotations/${q.id}/send`)
  const { portalToken } = await (await rep.post(`/api/quotations/${q.id}/send`)).json()
  expect((await (await rep.get(`/api/quotations/${q.id}/versions`)).json()).map((v: { version: number }) => v.version)).toEqual([1]) // unchanged re-send

  const customer = await request.newContext({ baseURL: API })
  expect((await customer.post(`/api/portal/${portalToken}/confirm`)).status()).toBe(400) // no signature
  await customer.post(`/api/portal/${portalToken}/negotiate`, { data: { type: 'counter_discount', counterDiscountPct: 3 } })
  const done = await (await customer.post(`/api/portal/${portalToken}/confirm`, { data: SIGN })).json()
  expect(done.version).toBe(2)

  const versions = await (await rep.get(`/api/quotations/${q.id}/versions`)).json()
  expect(versions[0]).toMatchObject({ version: 2, signedName: SIGN.signerName })
  expect(versions[1].signedAt).toBeNull()
  const diff = await (await rep.get(`/api/quotations/${q.id}/versions/compare?from=1&to=2`)).json()
  expect(diff.fields.map((f: { field: string }) => f.field)).toEqual(['orderDiscountPct', 'total'])
  // the portal shows who signed which version, and never cost
  const portal = await (await customer.get(`/api/portal/${portalToken}`)).json()
  expect(portal.signature).toMatchObject({ name: SIGN.signerName, version: 2 })
  expect(JSON.stringify(portal)).not.toMatch(/unitCost|margin/i)
})
