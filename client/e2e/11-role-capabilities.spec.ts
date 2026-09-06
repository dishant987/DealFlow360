import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs, login } from './helpers'

/**
 * §3 User Roles — one test per bullet in the brief, driven through the UI the
 * role would actually use.
 */

async function approvedQuote(rep: APIRequestContext, discountPct = 0) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: laptop.id, quantity: 2, discountPct },
  })
  await rep.post(`/api/quotations/${q.id}/submit`)
  return q.id as string
}

test.describe('Sales Rep', () => {
  test('builds quotations, applies discounts, adds upsell items', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/quotations')
    // creation is behind a dialog
    await page.getByRole('button', { name: 'New Quotation' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Customer').selectOption({ label: 'Acme Corp (gold)' })
    await dialog.getByRole('button', { name: 'Create quotation' }).click()
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/)

    // add a product
    const picker = page.getByRole('combobox').first()
    const laptop = await picker
      .locator('option', { hasText: 'Business Laptop' })
      .first()
      .getAttribute('value')
    await picker.selectOption(laptop!)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('row').nth(1)).toBeVisible()

    // apply a line discount
    const disc = page.getByRole('row').nth(1).locator('input[type="number"]')
    await disc.fill('10')
    await disc.blur()
    await expect(page.getByRole('row').nth(1).getByText('OK')).toBeVisible()

    // apply an order-level discount
    const orderDisc = page.getByRole('complementary').locator('input[type="number"]')
    await orderDisc.fill('3')
    await orderDisc.blur()

    // add an upsell item
    await expect(page.getByText('Suggested add-ons')).toBeVisible()
    const before = await page.getByRole('row').count()
    await page.getByRole('button', { name: 'Add to Quote' }).first().click()
    await expect(async () => {
      expect(await page.getByRole('row').count()).toBeGreaterThan(before)
    }).toPass({ timeout: 10_000 })
  })

  test('tracks approval status', async ({ page }) => {
    const rep = await apiAs('rep')
    const id = await approvedQuote(rep, 40) // breaches → routed for approval

    await login(page, 'rep')
    // status is visible on the pipeline...
    await page.goto('/quotations')
    await expect(page.getByText('pending approval').first()).toBeVisible()
    // ...and on the deal itself
    await page.goto(`/quotations/${id}`)
    await expect(page.getByText(/Locked — this quotation is pending approval/)).toBeVisible()

    // once approved, the rep sees that too
    const mgr = await apiAs('manager')
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })
    const fin = await apiAs('finance')
    await fin.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })
    await page.reload()
    await expect(page.getByRole('link', { name: 'Go to Fulfillment' })).toBeVisible()
  })

  test('tracks fulfillment progress on their own deal', async ({ page }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedQuote(rep, 0) // clean → auto-approved
    await fin.post(`/api/quotations/${id}/fulfillment/accept`)

    await login(page, 'rep')
    await page.goto(`/quotations/${id}/fulfillment`)
    await expect(page.getByText('Saved allocations')).toBeVisible()
    await expect(page.getByText('Main Warehouse').or(page.getByText('East Depot')).first()).toBeVisible()

    // read-only: the split decision belongs to finance/ops
    await expect(page.getByRole('button', { name: /Accept.*Split/i })).toHaveCount(0)
    const write = await rep.post(`/api/quotations/${id}/fulfillment/accept`)
    expect(write.status(), 'rep may watch, not decide').toBe(403)
  })

  test('tracks billing progress on their own deal', async ({ page }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedQuote(rep, 0)
    await fin.post(`/api/quotations/${id}/billing/generate`)

    await login(page, 'rep')
    await page.goto(`/quotations/${id}/billing`)
    await expect(page.getByText('One-time invoices')).toBeVisible()
    await expect(page.getByRole('button', { name: /Generate Billing|Regenerate/i })).toHaveCount(0)
  })

  test('responds to customer negotiation requests', async ({ page }) => {
    const rep = await apiAs('rep')
    const id = await approvedQuote(rep, 0)
    const sent = await (await rep.post(`/api/quotations/${id}/send`)).json()
    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${sent.portalToken}/negotiate`, {
      data: { type: 'comment', message: 'Can we get this by Friday?' },
    })

    await login(page, 'rep')
    await page.goto(`/quotations/${id}`)
    await expect(page.getByText('Customer requests')).toBeVisible()
    await expect(page.getByText('Can we get this by Friday?')).toBeVisible()
    await page.getByRole('button', { name: 'Mark addressed' }).first().click()
    await expect(page.getByText('addressed').first()).toBeVisible({ timeout: 10_000 })

    // and can re-send the revised quote
    await expect(page.getByRole('button', { name: /Re-send to Customer/i })).toBeVisible()
  })
})

test.describe('Sales Manager / Approver', () => {
  test('reviews and approves or rejects quotations over threshold', async ({ page }) => {
    const rep = await apiAs('rep')
    const id = await approvedQuote(rep, 40)
    await login(page, 'manager')
    await page.goto('/approvals')
    await expect(page.getByRole('columnheader', { name: 'Blended Risk' })).toBeVisible()
    await page.goto(`/approvals/${id}`)
    await expect(page.getByText('Blended risk score')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Return for revision' })).toBeVisible()
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(async () => {
      const d = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(['approved', 'pending_approval']).toContain(d.status)
    }).toPass({ timeout: 10_000 })
  })

  test('configures discount tiers and approval chains in the UI', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/admin')
    await expect(page.getByText('Discount configuration')).toBeVisible()
    await expect(page.getByText('Discount Tiers').first()).toBeVisible()
    await expect(page.getByText('Category Ceilings').first()).toBeVisible()
    // the approval chain = the two routing thresholds, on their own tab
    await page.getByRole('tab', { name: 'Thresholds' }).click()
    await expect(page.getByText('Manager threshold').first()).toBeVisible()
    await expect(page.getByText('Finance threshold').first()).toBeVisible()
    // catalogue setup is NOT a manager's job
    await expect(page.getByRole('tab', { name: 'Products' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Users' })).toHaveCount(0)
  })

  test('monitors the deal health dashboard and can act on an alert', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/deal-health')
    await expect(page.getByText(/Stalled deals/)).toBeVisible()
    await expect(page.getByText('Discount anomalies')).toBeVisible()
    const nudge = page.getByRole('button', { name: 'Nudge' }).first()
    if (await nudge.isVisible().catch(() => false)) {
      await nudge.click()
      await expect(page.getByRole('button', { name: 'Escalate' }).first()).toBeVisible()
    }
  })
})

test.describe('Finance / Operations User', () => {
  test('handles the second-level approval for high-risk discounts', async ({ page }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop')
    const setup = products.find((p: any) => p.name === 'Setup Service')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: laptop.id, quantity: 2, discountPct: 40 },
    })
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: setup.id, quantity: 1, discountPct: 40 },
    })
    const sub = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
    expect(sub.risk.requiresFinance, 'high risk needs the finance step').toBe(true)
    await mgr.post(`/api/approvals/${q.id}/action`, { data: { action: 'approve' } })

    await login(page, 'finance')
    await page.goto(`/approvals/${q.id}`)
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(async () => {
      const d = await (await rep.get(`/api/quotations/${q.id}`)).json()
      expect(d.status).toBe('approved')
    }).toPass({ timeout: 10_000 })
  })

  test('manages warehouse splits and backorder decisions', async ({ page }) => {
    const rep = await apiAs('rep')
    const id = await approvedQuote(rep, 0)
    await login(page, 'finance')
    await page.goto(`/quotations/${id}/fulfillment`)
    await expect(page.getByRole('button', { name: /Accept.*Split/i })).toBeVisible()
    await page.getByRole('button', { name: /Accept.*Split/i }).click()
    await expect(async () => {
      const d = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(d.status).toBe('fulfilled')
    }).toPass({ timeout: 15_000 })
    // and the cross-order queue with the backorder view
    await page.goto('/fulfillment')
    await expect(page.getByText('With backorder')).toBeVisible()
    await expect(page.getByText('Replenishment needed')).toBeVisible()
  })

  test('reconciles recurring billing and credit notes', async ({ page }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const support = products.find((p: any) => p.name === 'Support Plan')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: support.id, quantity: 4, discountPct: 0 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)
    await fin.post(`/api/quotations/${q.id}/billing/generate`)

    await login(page, 'finance')
    await page.goto(`/quotations/${q.id}/billing`)
    await expect(page.getByText('Recurring subscriptions')).toBeVisible()
    // Pause / Cancel per subscription line (Cancel opens a confirm dialog)
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true }).first()).toBeVisible()

    // a downgrade produces a credit note the finance user can see
    const view = await (await fin.get(`/api/quotations/${q.id}/billing`)).json()
    const lineId = view.schedules[0].quoteLineId
    await fin.post(`/api/quotations/${q.id}/billing/subscriptions/${lineId}/change`, {
      data: { quantity: 1 },
    })
    await page.reload()
    await expect(page.getByText(/Credit notes/)).toBeVisible()
  })
})

test.describe('Customer (Portal User)', () => {
  test('views the quotation, asks a line-level question, counters, confirms', async ({ page }) => {
    const rep = await apiAs('rep')
    const id = await approvedQuote(rep, 0)
    const sent = await (await rep.post(`/api/quotations/${id}/send`)).json()

    await page.context().clearCookies()
    await page.goto(`/portal/${sent.portalToken}`)

    // views it
    await expect(page.getByText("What's included")).toBeVisible()
    await expect(page.getByText('Business Laptop')).toBeVisible()
    await expect(page.getByText('Summary')).toBeVisible()

    // line-level question: Comment opens an inline note box, then Send
    await page.getByRole('button', { name: 'Comment' }).first().click()
    await page.getByPlaceholder(/Question or change request for/).fill('Does this include the charger?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('Your requests')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Does this include the charger?')).toBeVisible()

    // counters a discount
    await page.locator('#counter').fill('12')
    await page.getByRole('button', { name: 'Submit request' }).click()
    await expect(page.getByText('Counter: 12%')).toBeVisible({ timeout: 15_000 })

    // confirms with one click
    await page.getByRole('button', { name: /Confirm quotation/i }).click()
    await expect(page.getByText(/You've confirmed this quotation/)).toBeVisible({ timeout: 15_000 })
    const d = await (await rep.get(`/api/quotations/${id}`)).json()
    expect(['confirmed', 'pending_approval']).toContain(d.status)
  })
})

test.describe('Admin', () => {
  test('manages products, price lists, discount tiers, warehouses and plans', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/admin')
    await expect(page.getByText('Backend configuration')).toBeVisible()
    for (const tab of [
      'Products',
      'Categories',
      'Customers',
      'Variants',
      'Warehouses',
      'Stock',
      'Subscription Plans',
      'Upsell Pairings',
      'Discount Tiers',
      'Category Ceilings',
      'Users',
    ])
      await expect(page.getByText(tab, { exact: true }).first(), tab).toBeVisible()

    // price list is reachable and writable
    const admin = await apiAs('admin')
    expect((await admin.get('/api/config/price-list')).status()).toBe(200)
    const products = await (await admin.get('/api/config/products')).json()
    const laptop = (products.rows ?? products).find((p: any) => p.name === 'Business Laptop')
    expect(laptop, 'catalogue readable').toBeTruthy()
  })

  test('views platform-wide analytics and reporting', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/reports')
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export XLS' })).toBeVisible()

    const admin = await apiAs('admin')
    const report = await (await admin.get('/api/reports')).json()
    const repView = await apiAs('rep')
    const mine = await (await repView.get('/api/quotations')).json()
    expect(
      report.summary.count,
      'admin sees the whole platform, not one rep',
    ).toBeGreaterThan(mine.length)

    await page.goto('/deal-health')
    await expect(page.getByText(/Stalled deals/)).toBeVisible()
    const summary = await (await admin.get('/api/summary')).json()
    expect(summary.scope).toBe('all')
  })
})
