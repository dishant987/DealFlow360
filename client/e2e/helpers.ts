import { expect, test, type Page, type Locator, type APIRequestContext, request } from '@playwright/test'

export const API = process.env.E2E_API_URL || 'http://localhost:4000'
export const PASSWORD = 'password123'

export const ACCOUNTS = {
  rep: { email: 'rep@dealflow.com', name: 'Riya Rep' },
  rep2: { email: 'dev@dealflow.com', name: 'Dev Rep' },
  manager: { email: 'manager@dealflow.com', name: 'Manoj Manager' },
  finance: { email: 'finance@dealflow.com', name: 'Farah Finance' },
  admin: { email: 'admin@dealflow.com', name: 'Aditi Admin' },
} as const
export type Role = keyof typeof ACCOUNTS

// One real sign-in per role per worker; every later login reuses the session
// cookie. Signing in through the form (bcrypt + page render) for each of ~80 tests
// was the biggest single cost of the suite. The form itself is covered by
// loginViaForm in 01-auth.
const sessions = new Map<Role, Promise<string>>()
function sessionFor(role: Role) {
  if (!sessions.has(role))
    sessions.set(
      role,
      (async () => {
        const ctx = await request.newContext({ baseURL: API })
        const res = await ctx.post('/api/auth/login', { data: { email: ACCOUNTS[role].email, password: PASSWORD } })
        expect(res.status(), `login as ${role}`).toBe(200)
        const token = (await ctx.storageState()).cookies.find((c) => c.name === 'token')?.value
        await ctx.dispose()
        if (!token) throw new Error(`no session cookie for ${role}`)
        return token
      })(),
    )
  return sessions.get(role)!
}

/** Signed-in browser for `role`, landed on the dashboard (fast: reuses the session cookie). */
export async function login(page: Page, role: Role) {
  const base = test.info().project.use.baseURL ?? 'http://localhost:5173'
  await page.context().addCookies([{ name: 'token', value: await sessionFor(role), url: base }])
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })
}

/** Log in through the real login form — for tests that are about signing in. */
export async function loginViaForm(page: Page, role: Role) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(ACCOUNTS[role].email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}

/** A cookie-authenticated API context for the given role — used to assert the
 *  server enforces what the UI merely hides. */
export async function apiAs(role: Role): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API, extraHTTPHeaders: { cookie: `token=${await sessionFor(role)}` } })
}

/** Collect console errors and failed responses for a page. */
export function watchPage(page: Page) {
  const consoleErrors: string[] = []
  const httpErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 500) httpErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })
  return { consoleErrors, httpErrors }
}

/** Create a quotation straight through the API (fast setup for flows whose
 *  subject is NOT the builder UI). Returns the quotation id. */
export async function createQuote(ctx: APIRequestContext, customerName: string) {
  const customers = await (await ctx.get('/api/customers')).json()
  const customer = customers.find((c: any) => c.name === customerName)
  expect(customer, `customer ${customerName} exists`).toBeTruthy()
  const res = await ctx.post('/api/quotations', { data: { customerId: customer.id } })
  expect(res.status()).toBe(201)
  return (await res.json()).id as string
}

export async function addLine(
  ctx: APIRequestContext,
  quoteId: string,
  productName: string,
  quantity: number,
  discountPct: number,
) {
  const products = await (await ctx.get('/api/products')).json()
  const p = products.find((x: any) => x.name === productName)
  expect(p, `product ${productName} exists`).toBeTruthy()
  const res = await ctx.post(`/api/quotations/${quoteId}/lines`, {
    data: { productId: p.id, quantity, discountPct },
  })
  expect(res.status(), `add line ${productName}`).toBe(201)
  return await res.json()
}

export async function listProducts(ctx: APIRequestContext) {
  return (await (await ctx.get('/api/products')).json()) as any[]
}

/** Choose from a searchable picker (ui/combobox): open it, type, click the match. */
export async function pick(scope: Page | Locator, label: string, option: string) {
  const trigger = scope.getByRole('combobox', { name: label, exact: true })
  await trigger.click()
  const id = await trigger.getAttribute('aria-controls')
  const page = 'page' in scope ? scope.page() : scope
  await page.locator(`input[aria-controls="${id}"]`).fill(option)
  await page.locator(`[id="${id}"]`).getByRole('option', { name: option }).first().click()
  await expect(trigger).toContainText(option)
}
