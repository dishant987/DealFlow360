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

  test('the rep sees the portal link with a working Copy button, and it survives a reload', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const rep = await apiAs('rep')
    const { id } = await sentQuote(rep)

    await login(page, 'rep')
    await page.goto(`/quotations/${id}`)

    // the link is rebuilt from the stored token, not just held in memory from
    // the /send response — so it is still here on a cold load
    const field = page.getByLabel('Customer portal link')
    await expect(field).toBeVisible()
    const shown = await field.inputValue()
    expect(shown).toMatch(/\/portal\/[0-9a-f]{48}$/)

    await page.getByRole('button', { name: 'Copy portal link' }).click()
    await expect(page.getByRole('button', { name: 'Copy portal link' })).toContainText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown)

    // and the copied link actually opens the customer's portal
    await page.context().clearCookies()
    await page.goto(shown)
    await expect(page.getByText("What's included")).toBeVisible()
  })

  test('a draft shows no portal link at all', async ({ page }) => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const q = await (
      await rep.post('/api/quotations', { data: { customerId: customers[0].id } })
    ).json()
    await login(page, 'rep')
    await page.goto(`/quotations/${q.id}`)
    await expect(page.getByLabel('Customer portal link')).toHaveCount(0)
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

  // A variant can carry its own extra price, so omitting it showed the customer
  // a price the catalogue does not list, with nothing on the page explaining why.
  test('the customer sees which variant they are buying, and the price it explains', async ({
    page,
  }) => {
    const rep = await apiAs('rep')
    const admin = await apiAs('admin')

    // give the monitor a variant that actually costs more
    const products = await (await rep.get('/api/products')).json()
    const monitor = products.find((p: any) => p.name === '4K Monitor')
    const variant = await (
      await admin.post('/api/config/variants', {
        data: {
          productId: monitor.id,
          attribute: 'Size',
          value: `E2E ${Date.now()}`,
          extraPrice: 75,
        },
      })
    ).json()

    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: monitor.id, variantId: variant.id, quantity: 1, discountPct: 0 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)
    const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()

    await page.context().clearCookies()
    await page.goto(`/portal/${sent.portalToken}`)

    // the variant is named on the line…
    await expect(page.getByText(`Size: ${variant.value}`)).toBeVisible()
    // …and the unit price is the gold price ($400) PLUS the variant's $75
    await expect(page.getByText('$475.00').first()).toBeVisible()

    const portal = await (await rep.get(`/api/portal/${sent.portalToken}`)).json()
    expect(portal.lines[0].variantAttribute).toBe('Size')
    expect(portal.lines[0].variantValue).toBe(variant.value)
    expect(Number(portal.lines[0].unitPrice)).toBe(475)
    expect(portal.total).toBe(475)

    await admin.delete(`/api/config/variants/${variant.id}`)
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

  // §5 says a CHANGE re-opens the chain: "if terms change beyond thresholds
  // during negotiation". A deal that a manager already signed off, and that the
  // customer then accepts unaltered, must not go back to that same manager for
  // the same decision on the same numbers.
  test('confirming an already-approved discount unchanged does NOT re-enter approval', async ({
    page,
  }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')

    // a quote that genuinely needed approval, and got it
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const monitor = products.find((p: any) => p.name === '4K Monitor')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: monitor.id, quantity: 1, discountPct: 21 },
    })
    const submitted = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
    expect(submitted.risk.requiresManager, '21% on a 15% ceiling needs sign-off').toBe(true)
    await mgr.post(`/api/approvals/${q.id}/action`, { data: { action: 'approve' } })
    expect((await (await rep.get(`/api/quotations/${q.id}`)).json()).status).toBe('approved')

    const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()

    // the customer accepts exactly what they were sent — no counter, no changes
    await page.context().clearCookies()
    await page.goto(`/portal/${sent.portalToken}`)
    await page.getByRole('button', { name: /Confirm quotation/i }).click()

    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${q.id}`)).json()
      expect(detail.status, 'the existing sign-off still stands').toBe('confirmed')
    }).toPass({ timeout: 15_000 })

    // and no fresh approval step was raised
    const detail = await (await mgr.get(`/api/approvals/${q.id}`)).json()
    expect(detail.steps.filter((s: any) => s.action === null), 'no new pending step').toEqual([])
    expect(detail.audit.some((a: any) => a.action === 'customer_confirmed')).toBe(true)
    expect(detail.audit.some((a: any) => a.action === 'customer_confirm_reapproval')).toBe(false)
    await expect(page.getByText(/You've confirmed this quotation/)).toBeVisible()
  })

  test('a quote sent back for review stops offering the customer dead buttons', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'counter_discount', counterDiscountPct: 45 },
    })
    await anon.post(`/api/portal/${token}/confirm`)
    expect((await (await rep.get(`/api/quotations/${id}`)).json()).status).toBe('pending_approval')

    await page.context().clearCookies()
    await page.goto(`/portal/${token}`)
    await expect(page.getByText(/we're reviewing the discount you asked for/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Confirm quotation/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Comment' })).toHaveCount(0)
  })

  // The full negotiation round trip. Once the approver clears the counter-offer
  // the deal must LAND — the customer already confirmed, so it cannot come to
  // rest on 'approved' with the portal closed and nobody able to move it on.
  test('an approved counter-offer completes the deal without a second customer click', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')

    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'counter_discount', counterDiscountPct: 45 },
    })
    await anon.post(`/api/portal/${token}/confirm`)
    expect((await (await rep.get(`/api/quotations/${id}`)).json()).status).toBe('pending_approval')

    // a 45% counter clears both thresholds, so both approvers sign it off
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })
    expect(
      (await (await rep.get(`/api/quotations/${id}`)).json()).status,
      'still waiting on finance',
    ).toBe('pending_approval')
    const fin = await apiAs('finance')
    await fin.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })

    const after = await (await rep.get(`/api/quotations/${id}`)).json()
    expect(after.status, 'the deal lands rather than stranding on approved').toBe('confirmed')
    expect(Number(after.orderDiscountPct)).toBe(45)

    // and the customer's view says so
    const portal = await (await anon.get(`/api/portal/${token}`)).json()
    expect(portal.status).toBe('confirmed')
  })

  test('a rejected counter-offer does not confirm the deal', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const { id, token } = await sentQuote(rep)
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${token}/negotiate`, {
      data: { type: 'counter_discount', counterDiscountPct: 45 },
    })
    await anon.post(`/api/portal/${token}/confirm`)
    await mgr.post(`/api/approvals/${id}/action`, {
      data: { action: 'reject', reason: 'margin below floor' },
    })
    expect((await (await rep.get(`/api/quotations/${id}`)).json()).status).toBe('rejected')
  })

  // a normal rep submission must still land on 'approved', not 'confirmed'
  test('a rep-submitted quote still ends at approved, not confirmed', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: laptop.id, quantity: 2, discountPct: 40 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)
    await mgr.post(`/api/approvals/${q.id}/action`, { data: { action: 'approve' } })
    const fin = await apiAs('finance')
    await fin.post(`/api/approvals/${q.id}/action`, { data: { action: 'approve' } })
    expect((await (await rep.get(`/api/quotations/${q.id}`)).json()).status).toBe('approved')
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
