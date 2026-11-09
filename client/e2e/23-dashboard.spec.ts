import { test, expect, request } from '@playwright/test'
import { API, PASSWORD, login } from './helpers'

test.describe('Workspace dashboard', () => {
  test('a manager sees what needs them, the numbers and the charts — no duplicate nav tiles', async ({ page }) => {
    await login(page, 'manager')
    await expect(page.getByText('Needs your attention')).toBeVisible()
    const tasks = page.getByRole('list', { name: 'Tasks' })
    await expect(tasks.getByRole('link', { name: /Quotations waiting for approval/ })).toBeVisible()
    for (const kpi of ['Open pipeline', 'Won this month', 'Win rate', 'Average discount'])
      await expect(page.getByText(kpi, { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: /pipeline value by stage/ })).toBeVisible()
    await expect(page.getByRole('img', { name: /invoiced revenue by month/ })).toBeVisible()
    // the old tiles that repeated the sidebar are gone
    await expect(page.getByText('Orders awaiting warehouse split')).toHaveCount(0)

    await tasks.getByRole('link', { name: /Quotations waiting for approval/ }).click()
    await expect(page).toHaveURL(/\/approvals$/)
  })

  test('a rep sees only their own deals and rep-shaped tasks', async ({ page }) => {
    await login(page, 'rep')
    await expect(page.getByText('your deals', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: /Quotations waiting for approval/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Overdue invoices/ })).toHaveCount(0)
  })

  test('a brand-new company gets a setup checklist that tracks progress', async ({ page }) => {
    const ctx = await request.newContext({ baseURL: API })
    const email = `fresh-${Date.now()}@example.com`
    expect((await ctx.post('/api/auth/signup', { data: { name: 'Fresh Founder', email, password: PASSWORD, company: 'Fresh Co' } })).status()).toBe(201)
    const summary = await (await ctx.get('/api/summary')).json()
    expect(summary.checklist).toEqual({ products: false, customers: false, quotes: false, sent: false })
    expect(summary.tasks.every((t: { count: number }) => t.count === 0)).toBe(true)

    await ctx.post('/api/config/customers', { data: { name: 'First Customer', email: `first-${Date.now()}@example.com`, tier: 'bronze' } })
    expect((await (await ctx.get('/api/summary')).json()).checklist.customers).toBe(true)

    await page.goto('/login')
    await page.getByPlaceholder('you@company.com').fill(email)
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Get set up')).toBeVisible()
    await expect(page.getByText("You're all caught up.")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Add your products' })).toBeVisible()
  })
})
