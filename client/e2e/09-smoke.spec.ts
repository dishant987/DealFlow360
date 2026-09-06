import { test, expect } from '@playwright/test'
import { apiAs, login, watchPage, type Role } from './helpers'

// Every screen a role can reach must render without a console error or a 5xx.
const PAGES: Record<Role, string[]> = {
  rep: ['/', '/quotations', '/profile'],
  rep2: ['/', '/quotations', '/profile'],
  manager: ['/', '/quotations', '/approvals', '/deal-health', '/reports', '/admin', '/profile'],
  finance: ['/', '/quotations', '/approvals', '/fulfillment', '/invoices', '/subscriptions', '/profile'],
  admin: [
    '/',
    '/quotations',
    '/approvals',
    '/fulfillment',
    '/invoices',
    '/subscriptions',
    '/deal-health',
    '/reports',
    '/admin',
    '/profile',
  ],
}

// noisy-but-harmless console output we do not want to fail a build on
const IGNORE = [/favicon/i, /Download the React DevTools/i, /websocket/i, /socket\.io/i]

test.describe('Smoke — every screen, every role', () => {
  for (const role of Object.keys(PAGES) as Role[]) {
    test(`${role}: all reachable pages render cleanly`, async ({ page }) => {
      const { consoleErrors, httpErrors } = watchPage(page)
      await login(page, role)
      for (const path of PAGES[role]) {
        await page.goto(path)
        await expect(page.locator('body')).toBeVisible()
        // the error boundary must never trip
        await expect(
          page.getByText('Something broke on this screen'),
          `${role} @ ${path}`,
        ).toHaveCount(0)
        await expect(page.getByText('Quotation not found.')).toHaveCount(0)
      }
      const real = consoleErrors.filter((e) => !IGNORE.some((r) => r.test(e)))
      expect(real, `${role} console errors`).toEqual([])
      expect(httpErrors, `${role} 5xx responses`).toEqual([])
    })
  }

  test('deep-linked detail screens render for the roles that own them', async ({ page }) => {
    const fin = await apiAs('finance')
    const mgr = await apiAs('manager')
    const { consoleErrors, httpErrors } = watchPage(page)

    const quotes = await (await mgr.get('/api/quotations')).json()
    const invoices = (await (await fin.get('/api/invoices')).json()).invoices
    const approvals = (await (await mgr.get('/api/approvals')).json()).rows

    await login(page, 'finance')
    const targets = [
      `/quotations/${quotes[0].id}`,
      `/quotations/${quotes[0].id}/fulfillment`,
      `/quotations/${quotes[0].id}/billing`,
      ...(invoices.length ? [`/invoices/${invoices[0].id}`] : []),
    ]
    for (const path of targets) {
      await page.goto(path)
      await expect(page.getByText('Something broke on this screen'), path).toHaveCount(0)
    }

    if (approvals.length) {
      await login(page, 'manager')
      await page.goto(`/approvals/${approvals[0].id}`)
      await expect(page.getByText('Something broke on this screen')).toHaveCount(0)
      await expect(page.getByText('Audit trail')).toBeVisible()
    }

    const real = consoleErrors.filter((e) => !IGNORE.some((r) => r.test(e)))
    expect(real, 'detail screen console errors').toEqual([])
    expect(httpErrors, 'detail screen 5xx').toEqual([])
  })

  test('the workspace summary tiles and activity feed load for every role', async () => {
    for (const role of ['rep', 'manager', 'finance', 'admin'] as Role[]) {
      const ctx = await apiAs(role)
      const s = await (await ctx.get('/api/summary')).json()
      expect(s, `${role} summary`).toHaveProperty('pendingApprovals')
      expect(s).toHaveProperty('openQuotations')
      expect(s).toHaveProperty('atRisk')
      expect(Array.isArray(s.activity)).toBe(true)
      expect(s.scope).toBe(role === 'rep' ? 'yours' : 'all')
    }
  })

  test('a rep\'s workspace counts only their own deals', async () => {
    const rep = await apiAs('rep')
    const summary = await (await rep.get('/api/summary')).json()
    const mine = await (await rep.get('/api/quotations')).json()
    const open = mine.filter((q: any) =>
      ['draft', 'pending_approval', 'sent', 'under_negotiation'].includes(q.status),
    ).length
    expect(summary.openQuotations).toBe(open)
  })

  test('health endpoint reports a live database', async () => {
    const ctx = await apiAs('rep')
    const res = await ctx.get('/api/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'connected' })
  })

  test('an unhandled server error never leaks SQL or a stack trace', async () => {
    const ctx = await apiAs('admin')
    const res = await ctx.get('/api/quotations/not-a-uuid')
    expect(res.status()).toBeGreaterThanOrEqual(400)
    const body = await res.text()
    expect(body).not.toMatch(/at Object\.|node_modules|SELECT .* FROM|pg_/i)
  })
})
