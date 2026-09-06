import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs } from './helpers'

/**
 * Regression guards for four defects found in the E2E audit and since fixed:
 *   1. the ops endpoints leaked every rep's deals to any rep
 *   2. the API accepted a reject/return with no reason (A3 requires one)
 *   3. POST /send blocked on the SMTP handshake (3.5s-25.5s)
 *   4. the auth rate limiter was commented out
 * Each asserts the behaviour the brief calls for, so a re-regression fails here.
 */

async function highRiskQuote(rep: APIRequestContext) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: laptop.id, quantity: 2, discountPct: 40 },
  })
  await rep.post(`/api/quotations/${q.id}/submit`)
  return q.id as string
}

test.describe('Regression guards', () => {
  // FIXED — ops.routes.ts mounted these behind requireAuth only, so a rep read
  // every other rep's deals. Everywhere else a rep is scoped to their own.
  test('a rep should not read other reps deals through the ops endpoints', async () => {
    const rep = await apiAs('rep')
    const statuses: Record<string, number> = {}
    for (const path of ['/api/invoices', '/api/fulfillment-queue', '/api/subscriptions'])
      statuses[path] = (await rep.get(path)).status()
    expect(statuses).toEqual({
      '/api/invoices': 403,
      '/api/fulfillment-queue': 403,
      '/api/subscriptions': 403,
    })
  })

  test('the invoice list a rep sees should only contain their own deals', async () => {
    const rep = await apiAs('rep')
    const mine = await (await rep.get('/api/quotations')).json()
    const mineIds = new Set(mine.map((q: any) => q.id))
    const res = await rep.get('/api/invoices')
    if (res.status() !== 200) return // already fixed by refusing outright
    const { invoices } = await res.json()
    const foreign = invoices.filter((i: any) => !mineIds.has(i.quotationId))
    expect(foreign.map((i: any) => i.invoiceNumber)).toEqual([])
  })

  // FIXED — A3 requires every rejection to carry a reason. The UI enforced it;
  // the API did not, so a direct call walked straight past the rule.
  test('the API should require a reason to reject', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const id = await highRiskQuote(rep)
    const res = await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'reject' } })
    expect(res.status()).toBe(400)
  })

  test('the API should require a reason to return for revision', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const id = await highRiskQuote(rep)
    const res = await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'return' } })
    expect(res.status()).toBe(400)
  })

  // FIXED — sendToCustomer awaited the SMTP send, blocking the rep's request for
  // as long as the mail server took. Observed 3.5s typical, 25.5s worst.
  test('sending a quote to the customer should not block on the mail server', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: laptop.id, quantity: 1, discountPct: 0 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)

    const started = Date.now()
    const res = await rep.post(`/api/quotations/${q.id}/send`)
    const elapsed = Date.now() - started
    expect(res.status()).toBe(200)
    expect(elapsed, `POST /send took ${elapsed}ms`).toBeLessThan(1000)
  })

  // FIXED — auth.routes.ts had its limiter commented out, so the credential
  // endpoints accepted unlimited guesses. Only FAILED attempts count now.
  test('repeated bad logins are throttled', async () => {
    const ctx = await apiAs('rep')
    // A throwaway address, because the budget is per account: hammering a real
    // fixture account would lock it out for the rest of the run.
    const target = `brute-${Date.now()}@dealflow.com`
    let throttled = false
    for (let i = 0; i < 60; i++) {
      const res = await ctx.post('/api/auth/login', {
        data: { email: target, password: `wrong-${i}` },
      })
      if (res.status() === 429) {
        throttled = true
        break
      }
    }
    expect(throttled, '60 bad logins in a row were all accepted for processing').toBe(true)
  })

  test('throttling one account under attack never locks out anybody else', async () => {
    const ctx = await apiAs('rep')
    const victim = `brute-${Date.now()}@dealflow.com`
    for (let i = 0; i < 40; i++)
      await ctx.post('/api/auth/login', { data: { email: victim, password: `wrong-${i}` } })
    expect(
      (await ctx.post('/api/auth/login', { data: { email: victim, password: 'x' } })).status(),
      'the attacked account is throttled',
    ).toBe(429)

    // …while a genuine sign-in from the same IP still works
    const ok = await ctx.post('/api/auth/login', {
      data: { email: 'rep@dealflow.com', password: 'password123' },
    })
    expect(ok.status(), 'an unrelated account is unaffected').toBe(200)
  })
})
