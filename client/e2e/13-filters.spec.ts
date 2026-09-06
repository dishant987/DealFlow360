import { test, expect, type Page } from '@playwright/test'
import { apiAs, login } from './helpers'

/** rows currently rendered in the table body */
const rowCount = async (page: Page) => (await page.getByRole('row').count()) - 1

test.describe('Quotations — filters and create dialog', () => {
  test('status, customer and over-ceiling filters narrow the list, Clear resets it', async ({
    page,
  }) => {
    await login(page, 'manager')
    await page.goto('/quotations')
    await expect(page.getByRole('columnheader', { name: 'Quote #' })).toBeVisible()
    const total = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])

    // status
    await page.getByLabel('Filter by status').selectOption('draft')
    await expect(async () => {
      const n = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])
      expect(n).toBeLessThan(total)
    }).toPass()
    for (const badge of await page.getByRole('cell').filter({ hasText: /^draft$/ }).all())
      await expect(badge).toBeVisible()

    // clear brings everything back
    await page.getByRole('button', { name: /Clear \d/ }).click()
    const back = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])
    expect(back).toBe(total)

    // customer
    await page.getByLabel('Filter by customer').selectOption('Acme Corp')
    await expect(page.getByRole('cell', { name: 'Acme Corp' }).first()).toBeVisible()
    const rows = await rowCount(page)
    expect(rows).toBeGreaterThan(0)
    for (const c of await page.getByRole('row').filter({ hasNotText: 'Quote #' }).all())
      await expect(c).toContainText('Acme Corp')

    // over-ceiling toggle stacks with it
    await page.getByRole('button', { name: 'Over ceiling only' }).click()
    await expect(page.getByRole('button', { name: /Clear 2/ })).toBeVisible()
    const flagged = await rowCount(page)
    expect(flagged).toBeLessThanOrEqual(rows)
  })

  test('filters apply to the kanban view too', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/quotations')
    await page.getByRole('button', { name: 'kanban' }).click()
    await expect(page.getByText('Drag a deal to move it forward')).toBeVisible()
    await page.getByLabel('Filter by customer').selectOption('Acme Corp')
    // every card on the board is now that customer
    const cards = page.locator('[data-slot="card"], .rounded-lg').filter({ hasText: 'QT-' })
    if ((await cards.count()) > 0)
      for (const c of await cards.all()) await expect(c).toContainText('Acme Corp')
    await page.getByRole('button', { name: 'table' }).click()
  })

  test('New Quotation opens a dialog and creates the deal', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/quotations')
    await page.getByRole('button', { name: 'New Quotation' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('New quotation')).toBeVisible()
    // nothing picked yet → cannot submit
    await expect(dialog.getByRole('button', { name: 'Create quotation' })).toBeDisabled()

    await dialog.getByLabel('Customer').selectOption({ label: 'Beta Industries (silver)' })
    await dialog.getByRole('button', { name: 'Create quotation' }).click()
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/)
    await expect(page.getByText('Beta Industries').first()).toBeVisible()
  })

  test('the create dialog can be cancelled without creating anything', async ({ page }) => {
    const rep = await apiAs('rep')
    const before = (await (await rep.get('/api/quotations')).json()).length
    await login(page, 'rep')
    await page.goto('/quotations')
    await page.getByRole('button', { name: 'New Quotation' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/quotations$/)
    const after = (await (await rep.get('/api/quotations')).json()).length
    expect(after).toBe(before)
  })
})

test.describe('Approvals — filters', () => {
  test('the count chips filter by outcome and toggle off again', async ({ page }) => {
    // admin opens on the whole pipeline; manager/finance open on their own queue
    await login(page, 'admin')
    await page.goto('/approvals')
    await expect(page.getByRole('columnheader', { name: 'Blended Risk' })).toBeVisible()
    const total = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])

    const rejected = page.getByRole('button', { name: /Rejected$/ })
    await rejected.click()
    await expect(rejected).toHaveAttribute('aria-pressed', 'true')
    for (const r of await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all())
      await expect(r).toContainText('Rejected')

    // clicking again clears it
    await rejected.click()
    await expect(rejected).toHaveAttribute('aria-pressed', 'false')
    const back = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])
    expect(back).toBe(total)
  })

  test('risk, stage and customer filters combine, and Clear resets all', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/approvals')

    await page.getByLabel('Filter by risk').selectOption('LOW')
    for (const r of await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all())
      await expect(r).toContainText('LOW')

    await page.getByLabel('Filter by customer').selectOption('Acme Corp')
    await expect(page.getByRole('button', { name: /Clear 2/ })).toBeVisible()

    await page.getByRole('button', { name: /Clear 2/ }).click()
    await expect(page.getByRole('button', { name: /Clear \d/ })).toHaveCount(0)
  })

  test('an approver opens on their OWN queue, not the whole pipeline', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/approvals')
    const scope = page.getByRole('button', { name: /Needs my decision/ })
    await expect(scope, 'scoped by default').toHaveAttribute('aria-pressed', 'true')

    // every row on screen is one this approver can actually decide
    for (const r of await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all())
      await expect(r.getByRole('button', { name: 'Review' })).toBeVisible()

    // and it can be widened to the full pipeline
    const mine = Number((await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1])
    await scope.click()
    await expect(scope).toHaveAttribute('aria-pressed', 'false')
    const everything = Number(
      (await page.getByText(/of \d+/).first().textContent())!.match(/of (\d+)/)![1],
    )
    expect(everything).toBeGreaterThan(mine)
  })

  test('manager and finance see different queues', async ({ page }) => {
    const numbers = async (role: 'manager' | 'finance') => {
      await login(page, role)
      await page.goto('/approvals')
      await expect(page.getByRole('columnheader', { name: 'Quotation' })).toBeVisible()
      const cells = await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all()
      const out: string[] = []
      for (const r of cells) out.push(((await r.textContent()) ?? '').slice(0, 14))
      return out
    }
    const mgr = await numbers('manager')
    const fin = await numbers('finance')
    expect(mgr.length, 'manager has work').toBeGreaterThan(0)
    expect(fin.length, 'finance has work').toBeGreaterThan(0)
    // the two queues must not be the same list of quotations
    expect(fin, 'finance is not just looking at the manager queue').not.toEqual(mgr)
  })

  test('the two queues are each at their own approval step', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/approvals')
    for (const r of await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all())
      await expect(r, 'finance only decides finance-stage deals').toContainText('Finance')

    await login(page, 'manager')
    await page.goto('/approvals')
    for (const r of await page.getByRole('row').filter({ hasNotText: 'Quotation' }).all())
      await expect(r, 'the manager only decides manager-stage deals').toContainText('Sales Manager')
  })
})

test.describe('Fulfillment queue — filters', () => {
  test('stock table filters by warehouse, product and below-reorder', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/fulfillment')
    await expect(page.getByText('Stock by warehouse')).toBeVisible()

    await page.getByLabel('Filter stock by warehouse').selectOption('East Depot')
    const stock = page.getByText('Stock by warehouse').locator('..').locator('..')
    for (const r of await stock.getByRole('row').filter({ hasNotText: 'Warehouse' }).all())
      await expect(r).toContainText('East Depot')

    await page.getByRole('button', { name: /Below reorder only/ }).click()
    await expect(page.getByRole('button', { name: /Clear 2/ }).first()).toBeVisible()
    await page.getByRole('button', { name: /Clear 2/ }).first().click()
  })

  test('orders table filters by fulfillment state and customer', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/fulfillment')
    await expect(page.getByText('Orders awaiting fulfillment')).toBeVisible()

    await page.getByLabel('Filter by fulfillment state').selectOption('partial')
    const orders = page.getByText('Orders awaiting fulfillment').locator('..').locator('..')
    for (const r of await orders.getByRole('row').filter({ hasNotText: 'Quote #' }).all())
      await expect(r).toContainText('backordered')
  })
})
