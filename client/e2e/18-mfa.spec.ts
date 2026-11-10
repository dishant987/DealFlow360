import { test, expect, request, type Page } from '@playwright/test'
import { API, PASSWORD, apiAs } from './helpers'
// the server's own RFC 6238 implementation, so the test computes codes like an authenticator app
import { totp } from '../../server/src/utils/totp'

// shortcut: each run leaves one throwaway user (audit rows reference it, so it can't be deleted); fine on a dev DB
const email = `mfa-${Date.now()}@example.com`

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe.serial('Two-factor authentication', () => {
  let secret = ''
  let recovery: string[] = []

  test.beforeAll(async () => {
    const admin = await apiAs('admin')
    const res = await admin.post('/api/config/users', { data: { name: 'MFA Probe', email, password: PASSWORD, role: 'rep' } })
    expect(res.status()).toBe(201)
  })

  test('turn it on from Profile: QR, code, recovery codes', async ({ page }) => {
    await signIn(page)
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Set up two-factor authentication' }).click()
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
    secret = (await page.getByTestId('mfa-secret').textContent())!.trim()

    await page.getByLabel('6-digit code').fill('000000')
    await page.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByText(/not valid/i).first()).toBeVisible()

    await page.getByLabel('6-digit code').fill(totp(secret))
    await page.getByRole('button', { name: 'Turn on' }).click()
    const list = page.getByRole('list', { name: 'Recovery codes' })
    await expect(list.getByRole('listitem')).toHaveCount(10)
    recovery = await list.getByRole('listitem').allTextContents()
    await page.getByRole('button', { name: "I've saved them" }).click()
    await expect(page.getByText('On', { exact: true })).toBeVisible()
  })

  test('the password alone no longer opens a session', async () => {
    const ctx = await request.newContext({ baseURL: API })
    const res = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } })
    expect(await res.json()).toEqual({ mfaRequired: true })
    expect(await (await ctx.get('/api/auth/me')).json(), 'pending step is not a session').toBeNull()
  })

  test('sign-in asks for the code; a wrong one is refused, the right one works', async ({ page }) => {
    await signIn(page)
    await expect(page.getByText('Two-factor authentication')).toBeVisible()
    await page.getByLabel('Authentication code').fill('123456')
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText(/not valid/i).first()).toBeVisible()
    await page.getByLabel('Authentication code').fill(totp(secret))
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('a recovery code works once', async () => {
    const use = async () => {
      const ctx = await request.newContext({ baseURL: API })
      await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } })
      return (await ctx.post('/api/auth/mfa/verify', { data: { code: recovery[0] } })).status()
    }
    expect(await use()).toBe(200)
    expect(await use(), 'the same recovery code is spent').toBe(401)
  })

  test('turning it off needs the password', async ({ page }) => {
    await signIn(page)
    await page.getByLabel('Authentication code').fill(totp(secret))
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Turn off' }).click()
    await page.getByLabel('Confirm your password').fill('wrong-password')
    await page.getByRole('button', { name: 'Turn off two-factor' }).click()
    await expect(page.getByText('Password is incorrect')).toBeVisible()
    await page.getByLabel('Confirm your password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Turn off two-factor' }).click()
    await expect(page.getByText('Off', { exact: true })).toBeVisible()

    const ctx = await request.newContext({ baseURL: API })
    const res = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } })
    expect((await res.json()).mfaRequired).toBeUndefined()
  })
})

test.describe('Google sign-in', () => {
  test('hidden and refused when the server has no Google credentials', async ({ page }) => {
    const ctx = await request.newContext({ baseURL: API })
    const { google } = await (await ctx.get('/api/auth/providers')).json()
    test.skip(google, 'Google is configured on this server')
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' }).or(page.getByText('Sign in').first())).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0)
    const res = await ctx.get('/api/auth/google', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers().location).toMatch(/\/login\?error=google_off$/)
  })

  test('a callback without the matching state is rejected', async () => {
    const ctx = await request.newContext({ baseURL: API })
    const res = await ctx.get('/api/auth/google/callback?code=x&state=forged', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers().location).toMatch(/\/login\?error=google$/)
  })
})
