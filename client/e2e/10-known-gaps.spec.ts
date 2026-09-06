import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs } from './helpers'

/**
 * Gaps found during the E2E audit. Each test asserts the behaviour the brief
 * calls for, so it goes green the moment the gap is closed. Kept in their own
 * file so a known gap never aborts an unrelated serial chain.
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

test.describe('Known gaps', () => {
  // GAP 1 — ops.routes.ts mounts these behind requireAuth only, so a rep reads
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

  // GAP 2 — A3 requires every approval/rejection to carry a reason. The UI
  // enforces it; the API does not, so any direct call bypasses the rule.
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

  // GAP 3 — sendToCustomer awaits the SMTP send, so the rep's request blocks
  // for as long as the mail server takes. Observed 3.5s typical, 25.5s worst.
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

  // GAP 4 — auth.routes.ts has its rate limiter commented out, so the
  // credential endpoints accept unlimited attempts.
  test('repeated bad logins should eventually be throttled', async () => {
    const ctx = await apiAs('rep')
    let throttled = false
    for (let i = 0; i < 60; i++) {
      const res = await ctx.post('/api/auth/login', {
        data: { email: 'rep@dealflow.com', password: `wrong-${i}` },
      })
      if (res.status() === 429) {
        throttled = true
        break
      }
    }
    expect(throttled, '60 bad logins in a row were all accepted for processing').toBe(true)
  })
})
