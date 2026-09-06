import { test, expect } from '@playwright/test'
import { apiAs, login, type Role } from './helpers'

// What each role should see in the top nav (§3 User Roles).
// Matched by href — the Approvals link's accessible name carries a count badge.
const NAV: Record<Role, { visible: string[]; hidden: string[] }> = {
  rep: {
    visible: ['/', '/quotations'],
    hidden: ['/approvals', '/fulfillment', '/invoices', '/subscriptions', '/deal-health', '/reports', '/admin'],
  },
  rep2: {
    visible: ['/', '/quotations'],
    hidden: ['/approvals', '/fulfillment', '/invoices', '/subscriptions', '/deal-health', '/reports', '/admin'],
  },
  manager: {
    visible: ['/', '/quotations', '/approvals', '/fulfillment', '/invoices', '/subscriptions', '/deal-health', '/reports', '/admin'],
    hidden: [],
  },
  finance: {
    visible: ['/', '/quotations', '/approvals', '/fulfillment', '/invoices', '/subscriptions', '/deal-health', '/reports'],
    hidden: ['/admin'],
  },
  admin: {
    visible: ['/', '/quotations', '/approvals', '/fulfillment', '/invoices', '/subscriptions', '/deal-health', '/reports', '/admin'],
    hidden: [],
  },
}

test.describe('§3 — role-based access', () => {
  for (const role of Object.keys(NAV) as Role[]) {
    test(`${role} sees the right navigation`, async ({ page }) => {
      await login(page, role)
      // the desktop nav inside the purple app header (mobile sheet is portaled out)
      const nav = page.locator('header nav')
      for (const href of NAV[role].visible)
        await expect(
          nav.locator(`a[href="${href}"]`).first(),
          `${role} nav shows ${href}`,
        ).toBeVisible()
      for (const href of NAV[role].hidden)
        await expect(
          nav.locator(`a[href="${href}"]`),
          `${role} nav hides ${href}`,
        ).toHaveCount(0)
    })
  }

  test('rep is bounced from manager-only routes', async ({ page }) => {
    await login(page, 'rep')
    for (const route of ['/approvals', '/deal-health', '/reports', '/admin']) {
      await page.goto(route)
      // the client renders an in-place 403 rather than redirecting
      await expect(
        page.getByText(/403 — you don't have access/),
        `rep should be blocked at ${route}`,
      ).toBeVisible()
    }
  })

  test('finance is bounced from /admin', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/admin')
    await expect(page.getByText(/403 — you don't have access/)).toBeVisible()
  })

  test('API refuses a rep on approval, report, dashboard and config endpoints', async () => {
    const rep = await apiAs('rep')
    for (const path of [
      '/api/approvals',
      '/api/reports',
      '/api/dashboard',
      '/api/config/settings',
      '/api/config/products',
      '/api/config/users',
    ]) {
      const res = await rep.get(path)
      expect(res.status(), `rep GET ${path}`).toBe(403)
    }
  })

  test('API refuses a manager on admin-only catalogue config', async () => {
    const mgr = await apiAs('manager')
    for (const path of ['/api/config/products', '/api/config/users', '/api/config/warehouses']) {
      const res = await mgr.get(path)
      expect(res.status(), `manager GET ${path}`).toBe(403)
    }
    // …but a manager DOES own discount governance
    expect((await mgr.get('/api/config/discount-tiers')).status()).toBe(200)
    expect((await mgr.get('/api/config/settings')).status()).toBe(200)
  })

  test('a rep cannot open another rep\'s quotation', async () => {
    const rep2 = await apiAs('rep2')
    const rep1 = await apiAs('rep')
    const theirs = await (await rep2.get('/api/quotations')).json()
    expect(theirs.length, 'rep2 has seeded quotations').toBeGreaterThan(0)
    const res = await rep1.get(`/api/quotations/${theirs[0].id}`)
    expect([403, 404], 'cross-rep read must be refused').toContain(res.status())
  })

  test('a rep cannot act on an approval step', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const rows = (await (await mgr.get('/api/approvals')).json()).rows
    if (!rows.length) test.skip()
    const res = await rep.post(`/api/approvals/${rows[0].id}/action`, {
      data: { action: 'approve' },
    })
    expect(res.status()).toBe(403)
  })

  test('a rep cannot record a payment or accept a fulfillment split', async () => {
    const rep = await apiAs('rep')
    const mine = await (await rep.get('/api/quotations')).json()
    const q = mine[0]
    const fulfil = await rep.post(`/api/quotations/${q.id}/fulfillment/accept`)
    expect(fulfil.status(), 'rep POST fulfillment/accept').toBe(403)
    const bill = await rep.post(`/api/quotations/${q.id}/billing/generate`)
    expect(bill.status(), 'rep POST billing/generate').toBe(403)
  })
})
