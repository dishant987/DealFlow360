import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { API, PASSWORD, apiAs } from './helpers'

const run = Date.now()

/** Sign up a brand-new company and return its admin's API session. */
async function newCompany(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API })
  const res = await ctx.post('/api/auth/signup', {
    data: { name: 'Tenant Admin', email: `tenant-${run}@example.com`, password: PASSWORD, company: `Tenant Co ${run}` },
  })
  expect(res.status()).toBe(201)
  expect((await res.json()).role, 'the person who signs up runs their company').toBe('admin')
  return ctx
}

test.describe.serial('Multi-company isolation', () => {
  let other: APIRequestContext
  let demoQuoteId = ''
  let demoCustomerId = ''

  test.beforeAll(async () => {
    other = await newCompany()
    const rep = await apiAs('rep')
    demoQuoteId = (await (await rep.get('/api/quotations')).json())[0].id
    demoCustomerId = (await (await rep.get('/api/customers')).json())[0].id
  })

  test('a new company starts empty, with default discount tiers', async () => {
    for (const path of ['/api/quotations', '/api/customers', '/api/products'])
      expect(await (await other.get(path)).json(), path).toEqual([])
    const inv = await (await other.get('/api/invoices')).json()
    expect(inv.invoices).toEqual([])
    expect(inv.summary.count).toBe(0)
    const appr = await (await other.get('/api/approvals')).json()
    expect(appr.rows).toEqual([])
    expect(appr.summary.total).toBe(0)
    const tiers = await (await other.get('/api/config/discount-tiers')).json()
    expect(tiers.map((t: any) => t.tier).sort()).toEqual(['bronze', 'gold', 'silver'])
    const users = await (await other.get('/api/config/users')).json()
    expect(users.map((u: any) => u.email)).toEqual([`tenant-${run}@example.com`])
  })

  test("another company's records can't be read or changed by id", async () => {
    expect((await other.get(`/api/quotations/${demoQuoteId}`)).status()).toBe(404)
    expect((await other.patch(`/api/quotations/${demoQuoteId}`, { data: { orderDiscountPct: 50 } })).status()).toBe(404)
    expect((await other.post(`/api/quotations/${demoQuoteId}/submit`)).status()).toBe(404)
    expect((await other.patch(`/api/config/customers/${demoCustomerId}`, { data: { name: 'Hijacked' } })).status()).toBe(404)
    // and a quote can't be opened on another company's customer
    const q = await other.post('/api/quotations', { data: { customerId: demoCustomerId } })
    expect(q.status(), "quote on another company's customer").toBeGreaterThanOrEqual(400)

    // nor can its own quote use another company's product (caught by the same-company foreign keys)
    const own = await (
      await other.post('/api/config/customers', { data: { name: 'Own', email: `own-${run}@example.com`, tier: 'bronze' } })
    ).json()
    const ownQuote = await (await other.post('/api/quotations', { data: { customerId: own.id } })).json()
    const demoProduct = (await (await (await apiAs('rep')).get('/api/products')).json())[0].id
    const line = await other.post(`/api/quotations/${ownQuote.id}/lines`, { data: { productId: demoProduct, quantity: 1, discountPct: 0 } })
    expect(line.status(), "line with another company's product").toBeGreaterThanOrEqual(400)

    const rep = await apiAs('rep')
    const still = await (await rep.get('/api/customers')).json()
    expect(still.find((c: any) => c.id === demoCustomerId).name).not.toBe('Hijacked')
  })

  test('names and SKUs are unique per company, not across companies', async () => {
    const cat = await other.post('/api/config/categories', { data: { name: 'Hardware' } })
    expect(cat.status(), 'the demo company already has "Hardware"').toBe(201)
    const prod = await other.post('/api/config/products', {
      data: { name: 'Laptop', sku: 'HW-LAPTOP', categoryId: (await cat.json()).id, unitPrice: '10', unitCost: '5' },
    })
    expect(prod.status(), 'the demo company already has SKU HW-LAPTOP').toBe(201)
  })

  test("the new company's data stays out of the demo company", async () => {
    const cust = await other.post('/api/config/customers', {
      data: { name: `Private ${run}`, email: `private-${run}@example.com`, tier: 'gold' },
    })
    expect(cust.status()).toBe(201)
    const mgr = await apiAs('manager')
    const seen = await (await mgr.get('/api/customers')).json()
    expect(seen.some((c: any) => c.email === `private-${run}@example.com`)).toBe(false)
    const users = await (await mgr.get('/api/config/users')).json().catch(() => [])
    expect(JSON.stringify(users)).not.toContain(`tenant-${run}@example.com`)
    const admin = await apiAs('admin')
    const adminUsers = await (await admin.get('/api/config/users')).json()
    expect(adminUsers.some((u: any) => u.email === `tenant-${run}@example.com`), 'admins only see their own company').toBe(false)
  })

  test("an admin can't edit or delete another company's user", async () => {
    const me = await (await other.get('/api/auth/me')).json()
    const admin = await apiAs('admin')
    expect((await admin.patch(`/api/config/users/${me.id}`, { data: { blocked: true } })).status()).toBe(404)
    expect((await admin.delete(`/api/config/users/${me.id}`)).status()).toBe(404)
    expect((await other.get('/api/auth/me')).status(), 'still signed in, untouched').toBe(200)
  })
})
