import { test, expect } from '@playwright/test'
import { ACCOUNTS, PASSWORD, apiAs, login, type Role } from './helpers'

const ROLES: Role[] = ['rep', 'manager', 'finance', 'admin']

test.describe('A1 — authentication', () => {
  for (const role of ROLES) {
    test(`${role} can log in and lands in the app`, async ({ page }) => {
      await login(page, role)
      await expect(page.getByRole('link', { name: 'DealFlow360' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    })
  }

  test('a rep is named "Sales Rep" everywhere the role is shown', async ({ page }) => {
    // login screen: the demo persona buttons
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sales Rep' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rep', exact: true })).toHaveCount(0)

    await login(page, 'rep')
    // workspace strapline
    await expect(page.getByText(/Signed in as\s*Sales Rep/)).toBeVisible()
    // account menu badge
    await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(page.getByText('Sales Rep').first()).toBeVisible()
    await page.keyboard.press('Escape')
    // profile card
    await page.goto('/profile')
    await expect(page.getByText('Your role')).toBeVisible()
    await expect(page.getByText('Sales Rep').first()).toBeVisible()
    // the bare code never leaks through
    await expect(page.getByText('rep', { exact: true })).toHaveCount(0)
  })

  test('the admin user list and role picker say "Sales Rep" too', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Users' }).click()
    await expect(page.getByRole('cell', { name: 'Sales Rep' }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'rep', exact: true })).toHaveCount(0)
  })

  test('bad password is rejected and keeps the user on /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('you@company.com').fill(ACCOUNTS.rep.email)
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('unknown email is rejected', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('you@company.com').fill('nobody@dealflow.com')
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/quotations')
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout clears the session', async ({ page }) => {
    await login(page, 'rep')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    // logout is behind a confirmation dialog
    await expect(page.getByText('Log out of DealFlow360?')).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/quotations')
    await expect(page).toHaveURL(/\/login/)
  })

  test('forgot-password never reveals whether an email exists', async () => {
    const ctx = await apiAs('rep')
    const known = await ctx.post('/api/auth/forgot-password', {
      data: { email: ACCOUNTS.rep.email },
    })
    const unknown = await ctx.post('/api/auth/forgot-password', {
      data: { email: 'ghost@nowhere.com' },
    })
    expect(known.status()).toBe(200)
    expect(unknown.status()).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
  })

  test('signup rejects a duplicate email', async () => {
    const ctx = await apiAs('rep')
    const res = await ctx.post('/api/auth/signup', {
      data: { name: 'Dupe', email: ACCOUNTS.rep.email, password: PASSWORD },
    })
    expect(res.status()).toBe(409)
  })

  test('reset-password rejects a bogus token', async () => {
    const ctx = await apiAs('rep')
    const res = await ctx.post('/api/auth/reset-password', {
      data: { token: 'not-a-real-token', password: 'newpassword1' },
    })
    expect(res.status()).toBe(400)
  })

  test('profile page loads and rejects a wrong current password', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/profile')
    await expect(page.getByText('Your role')).toBeVisible()

    const ctx = await apiAs('rep')
    const res = await ctx.patch('/api/auth/me', {
      data: { currentPassword: 'definitely-wrong', newPassword: 'anotherpass1' },
    })
    expect(res.status()).toBe(400)
  })

  test('a user cannot escalate their own role via PATCH /auth/me', async () => {
    const ctx = await apiAs('rep')
    await ctx.patch('/api/auth/me', { data: { name: 'Riya Rep', role: 'admin' } })
    const me = await (await ctx.get('/api/auth/me')).json()
    expect(me.role).toBe('rep')
  })
})
