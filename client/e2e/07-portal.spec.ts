import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs, login } from './helpers'

/** An approved quote, sent to the customer, with its portal token. */
async function sentQuote(rep: APIRequestContext, discountPct = 0) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: laptop.id, quantity: 2, discountPct },
  })
  await rep.post(`/api/quotations/${q.id}/submit`)
  const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()
  expect(sent.portalToken, 'portal token issued').toBeTruthy()
  return { id: q.id as string, token: sent.portalToken as string }
}

test.describe.serial('B8 — customer portal negotiation', () => {
  test('a quote cannot be sent to the customer before it is approved', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const q = await (
      await rep.post('/api/quotations', { data: { customerId: customers[0].id } })
    ).json()
    const res = await rep.post(`/api/quotations/${q.id}/send`)
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/must be approved/i)
  })

  test('the portal is a real, separate, unauthenticated view (§7)', async ({ page }) => {
    const rep = await apiAs('rep')
    const { token } = await sentQuote(rep)
    // brand-new browser context: no session cookie at all
    await page.context().clearCookies()
    await page.goto(`/portal/${token}`)
    await expect(page.getByText(/Business Laptop/)).toBeVisible()
    // and it is NOT the internal shell
    await expect(page.getByRole('link', { name: 'Approvals' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
  })

  test('cost and margin never reach the customer', async () => {
    const rep = await apiAs('rep')
    const { token } = await sentQuote(rep)
    const anon = await apiAs('rep') // context only; the portal route ignores auth
    const body = await (await anon.get(`/api/portal/${token}`)).text()
    expect(body).not.toMatch(/unitCost/)
    expect(body).not.toMatch(/margin/i)
    const json = JSON.parse(body)
    for (const l of json.lines) expect(l).not.toHaveProperty('unitCost')
  })

  test('an invalid portal token is rejected', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/portal/not-a-real-token')
    await expect(page.getByText("This link isn't valid")).toBeVisible({ timeout: 20_000 })
  })

  test('customer submits a line comment and a counter discount', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id, token } = await sentQuote(rep)
    await page.context().clearCookies()
    await page.goto(`/portal/${token}`)

    await page.locator('#counter').fill('30')
    await page.getByRole('button', { name: 'Submit request' }).click()
    await expect(page.getByText('Your requests')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Counter: 30%')).toBeVisible()

    // the deal moves to under negotiation and the rep can see the request
    const detail = await (await rep.get(`/api/quotations/${id}`)).json()
    expect(detail.status).toBe('under_negotiation')
    const requests = await (await rep.get(`/api/quotations/${id}/negotiations`)).json()
    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0].type).toBe('counter_discount')
    expect(requests[0].status).toBe('open')
  })

  test('the rep can mark a customer request addressed', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'comment', message: 'Can you ship sooner?' },
    })

    await login(page, 'rep')
    await page.goto(`/quotations/${id}`)
    await expect(page.getByText('Customer requests')).toBeVisible()
    await page.getByRole('button', { name: 'Mark addressed' }).first().click()
    await expect(page.getByText('addressed').first()).toBeVisible({ timeout: 10_000 })

    const requests = await (await rep.get(`/api/quotations/${id}/negotiations`)).json()
    expect(requests[0].status).toBe('addressed')
  })

  test('confirming with a big counter discount re-enters approval (§9 step 7)', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'counter_discount', counterDiscountPct: 45, message: 'best price?' },
    })

    await page.context().clearCookies()
    await page.goto(`/portal/${token}`)
    await page.getByRole('button', { name: /Confirm quotation/i }).click()

    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status, 'terms beyond threshold go back for approval').toBe('pending_approval')
    }).toPass({ timeout: 15_000 })

    const detail = await (await rep.get(`/api/quotations/${id}`)).json()
    expect(Number(detail.orderDiscountPct), 'counter applied to the order').toBe(45)
    expect(detail.requiresManager).toBe(true)
  })

  test('confirming within limits goes straight to confirmed (no approval)', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id, token } = await sentQuote(rep)
    await page.context().clearCookies()
    await page.goto(`/portal/${token}`)
    await page.getByRole('button', { name: /Confirm quotation/i }).click()

    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('confirmed')
    }).toPass({ timeout: 15_000 })
    await expect(page.getByText(/You've confirmed this quotation/)).toBeVisible()
  })

  test('a confirmed quote is closed to further customer changes', async () => {
    const rep = await apiAs('rep')
    const { token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/confirm`)
    const again = await anon.post(`/api/portal/${token}/confirm`)
    expect(again.status()).toBe(400)
    expect((await again.json()).error).toMatch(/already confirmed/i)
    const neg = await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'comment', message: 'one more thing' },
    })
    expect(neg.status(), 'no negotiation after confirmation').toBe(400)
  })

  test('customer activity is attributed to the portal in the audit trail', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'counter_discount', counterDiscountPct: 20 },
    })
    const detail = await (await mgr.get(`/api/approvals/${id}`)).json()
    const entry = detail.audit.find((a: any) => a.action === 'customer_counter_discount')
    expect(entry, 'customer action is logged').toBeTruthy()
    expect(entry.user, 'no internal user is credited for a customer action').toBeNull()
  })
})
