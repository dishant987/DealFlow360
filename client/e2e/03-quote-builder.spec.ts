import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

// §9 steps 2-4 + B3/B5: build a quote in the real UI, breach a ceiling,
// watch the live risk routing, accept an upsell.
test.describe.serial('B3/B5 — quotation builder', () => {
  let quoteUrl: string

  test('rep creates a quotation from the pipeline screen', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/quotations')
    // creation is behind a dialog
    await page.getByRole('button', { name: 'New Quotation' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Customer').selectOption({ label: 'Acme Corp (gold)' })
    await dialog.getByRole('button', { name: 'Create quotation' }).click()
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    quoteUrl = page.url()
    await expect(page.getByText('No lines yet — add a product above.')).toBeVisible()
  })

  test('adding a product line shows price, margin and its own ceiling', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    const picker = page.getByRole('combobox').first()
    await expect(picker).toBeVisible()
    // Business Laptop is the anchor of four seeded pairings, so the upsell
    // panel below has something to suggest.
    const laptop = await picker
      .locator('option', { hasText: 'Business Laptop' })
      .first()
      .getAttribute('value')
    await picker.selectOption(laptop!)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    const row = page.getByRole('row').nth(1)
    await expect(row).toBeVisible()
    // Limit column must show a real ceiling, and status OK at 0% discount
    await expect(row.getByText('OK')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Margin' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Limit' })).toBeVisible()
  })

  test('+/- quantity buttons change the line and the totals', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    const row = page.getByRole('row').nth(1)
    const qty = row.locator('span.w-6')
    await expect(qty).toHaveText('1')
    await row.getByRole('button', { name: '+' }).click()
    await expect(qty).toHaveText('2')
    await row.getByRole('button', { name: '−' }).click()
    await expect(qty).toHaveText('1')
  })

  test('a discount over the line ceiling flags OVER and routes for approval', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    const row = page.getByRole('row').nth(1)
    const disc = row.locator('input[type="number"]')
    await disc.fill('60')
    await disc.blur()
    await expect(row.getByText(/OVER/)).toBeVisible()
    await expect(page.getByText(/routes for Manager/)).toBeVisible()
  })

  test('upsell panel offers a suggestion with a margin delta, and Add to Quote works', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    await expect(page.getByText('Suggested add-ons')).toBeVisible()
    await expect(page.getByText(/Order margin .* pts if added/).first()).toBeVisible()
    const before = await page.getByRole('row').count()
    await page.getByRole('button', { name: 'Add to Quote' }).first().click()
    await expect(async () => {
      expect(await page.getByRole('row').count()).toBeGreaterThan(before)
    }).toPass({ timeout: 10_000 })
  })

  test('Dismiss removes a suggestion from the panel', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    const dismiss = page.getByRole('button', { name: 'Dismiss' }).first()
    await expect(dismiss).toBeVisible()
    const before = await page.getByRole('button', { name: 'Dismiss' }).count()
    await dismiss.click()
    await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(before - 1)
  })

  test('submit auto-routes for approval without the rep asking (§9 step 3)', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    await page.getByRole('button', { name: 'Submit / Confirm' }).click()
    await expect(page.getByText(/Routed for approval/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('pending approval', { exact: false }).first()).toBeVisible()
  })

  test('a submitted quote is locked against further edits', async ({ page }) => {
    await login(page, 'rep')
    await page.goto(quoteUrl)
    await expect(page.getByText(/Locked — this quotation is pending approval/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
  })

  test('server also refuses edits to a submitted quote', async () => {
    const rep = await apiAs('rep')
    const id = quoteUrl.split('/').pop()
    const res = await rep.patch(`/api/quotations/${id}`, { data: { orderDiscountPct: '5' } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/no longer be edited/i)
  })

  test('blended score: several small overages add up past the threshold', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const picks = products.filter((p: any) => p.type === 'onetime').slice(0, 3)
    // each line only a few points over its ceiling
    for (const p of picks)
      await rep.post(`/api/quotations/${q.id}/lines`, {
        data: { productId: p.id, quantity: 1, discountPct: 18 },
      })
    const detail = await (await rep.get(`/api/quotations/${q.id}`)).json()
    expect(detail.risk.score, 'overages are summed across lines').toBeGreaterThan(0)
    const submitted = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
    expect(submitted.risk.level).not.toBe('none')
    expect(submitted.quotation.status).toBe('pending_approval')
  })

  test('a fully compliant quote skips approval entirely', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const p = products.find((x: any) => x.type === 'onetime')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: p.id, quantity: 2, discountPct: 0 },
    })
    const submitted = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
    expect(submitted.risk.level).toBe('none')
    expect(submitted.quotation.status).toBe('approved')
  })
})
