import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('App shell', () => {
  test('sidebar shows the groups a role can use, and only those', async ({ page }) => {
    await login(page, 'rep')
    const main = page.getByRole('navigation', { name: 'Main' })
    await expect(main.getByRole('link', { name: 'Quotations' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Invoices' })).toHaveCount(0)
    await expect(main.getByRole('link', { name: 'Config' })).toHaveCount(0)

    await page.context().clearCookies()
    await login(page, 'admin')
    for (const name of ['Approvals', 'Fulfillment', 'Invoices', 'Reports', 'Config'])
      await expect(main.getByRole('link', { name })).toBeVisible()
  })

  test('the sidebar collapses to icons and remembers it', async ({ page }) => {
    await login(page, 'manager')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    // labels stay available to assistive tech and tooltips
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Approvals' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
  })

  test('Ctrl+K opens the command palette and jumps to a page', async ({ page }) => {
    await login(page, 'finance')
    // the shell (and its shortcut listener) is lazy-loaded with the first page
    await expect(page.getByRole('button', { name: 'Search (Ctrl K)' })).toBeVisible()
    await page.keyboard.press('Control+k')
    const search = page.getByRole('textbox', { name: 'Search pages and actions' })
    await expect(search).toBeVisible()
    await search.fill('invoi')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/invoices$/)
    await expect(search).toHaveCount(0)
  })

  test('on a phone the navigation lives in a drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, 'manager')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Approvals' }).click()
    await expect(page).toHaveURL(/\/approvals$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scroll).toBeLessThanOrEqual(client)
  })
})
