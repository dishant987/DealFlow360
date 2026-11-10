import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Landing page', () => {
  test('a visitor at / sees the marketing page, not a login redirect', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Dealwise/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Quote to cash')
    for (const id of ['workflow', 'features', 'security', 'pricing', 'faq'])
      await expect(page.locator(`#${id}`)).toBeVisible()
    // unbuilt features are labelled honestly
    await expect(page.getByText('Coming soon').first()).toBeVisible()
  })

  test('calls to action lead to sign-up and sign-in', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Start free/ }).click()
    await expect(page).toHaveURL(/\/signup$/)
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login$/)
    // the auth screens link back home
    await page.getByRole('link', { name: 'Dealwise' }).first().click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('a signed-in user at / gets the dashboard', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/')
    await expect(page.getByText('Needs your attention')).toBeVisible()
    await expect(page.getByRole('link', { name: /Start free/ })).toHaveCount(0)
  })

  test('no sideways scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scroll).toBeLessThanOrEqual(client)
  })

  test('light by default; the toggle switches to dark and remembers it', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).not.toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(html).toHaveClass(/dark/)
    await page.reload()
    await expect(html).toHaveClass(/dark/)
    // the same preference applies inside the app's auth screens
    await page.goto('/login')
    await expect(html).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(html).not.toHaveClass(/dark/)
  })

  test('a page chunk that fails to load once recovers with a single reload', async ({ page }) => {
    let failed = 0
    // dev serves page modules from /src/pages; fail the first fetch like a stale deploy would
    await page.route(/\/src\/pages\/Landing\.tsx/, (route) => {
      if (failed++ === 0) return route.abort()
      return route.continue()
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Quote to cash')
    expect(failed, 'first load failed, the reload succeeded').toBeGreaterThanOrEqual(2)
    await expect(page.getByText('Something broke on this screen')).toHaveCount(0)
  })

  test('privacy policy and terms are reachable from the footer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Terms of Service' }).click()
    await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible()
  })
})
