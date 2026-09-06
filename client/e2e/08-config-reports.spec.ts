import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

test.describe('A3/A7 — configuration and reporting', () => {
  test('admin config screen exposes every backend setup area (A2-A7)', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/admin')
    for (const section of [
      'Products',
      'Customers',
      'Categories',
      'Variants',
      'Warehouses',
      'Stock',
      'Subscription Plans',
      'Upsell Pairings',
      'Discount Tiers',
      'Category Ceilings',
      'Users',
    ]) {
      await expect(page.getByText(section, { exact: true }).first(), section).toBeVisible()
    }
  })

  test('thresholds are configurable and actually change routing (A3)', async () => {
    const mgr = await apiAs('manager')
    const rep = await apiAs('rep')
    const original = await (await mgr.get('/api/config/settings')).json()

    try {
      // make everything need approval
      await mgr.patch('/api/config/settings', {
        data: { managerThreshold: 0, financeThreshold: 1000 },
      })
      const customers = await (await rep.get('/api/customers')).json()
      const gold = customers.find((c: any) => c.tier === 'gold')
      const q = await (
        await rep.post('/api/quotations', { data: { customerId: gold.id } })
      ).json()
      const products = await (await rep.get('/api/products')).json()
      const laptop = products.find((p: any) => p.name === 'Business Laptop')
      // 16% on a gold/hardware line: ceiling is 15, so 1 point over
      await rep.post(`/api/quotations/${q.id}/lines`, {
        data: { productId: laptop.id, quantity: 1, discountPct: 16 },
      })
      const strict = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
      expect(strict.risk.requiresManager, 'threshold 0 routes a 1-point overage').toBe(true)
      expect(strict.risk.requiresFinance).toBe(false)

      // now raise the bar so the same quote clears
      await mgr.patch('/api/config/settings', {
        data: { managerThreshold: 50, financeThreshold: 100 },
      })
      const relaxed = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
      expect(relaxed.risk.requiresManager, 'threshold 50 lets it through').toBe(false)
      expect(relaxed.quotation.status).toBe('approved')
    } finally {
      await mgr.patch('/api/config/settings', {
        data: {
          managerThreshold: Number(original.managerThreshold),
          financeThreshold: Number(original.financeThreshold),
        },
      })
    }
  })

  test('a category ceiling tightens a line below its tier ceiling', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop') // Hardware, ceiling 15
    const setup = products.find((p: any) => p.name === 'Setup Service') // Services, ceiling 10
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: laptop.id, quantity: 1, discountPct: 12 },
    })
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: setup.id, quantity: 1, discountPct: 12 },
    })
    const detail = await (await rep.get(`/api/quotations/${q.id}`)).json()
    const byName = new Map(detail.lines.map((l: any) => [l.product, l]))
    expect((byName.get('Business Laptop') as any).ceiling, 'hardware ceiling').toBe(15)
    expect((byName.get('Setup Service') as any).ceiling, 'services ceiling is stricter').toBe(10)
    // the brief's worked example: only the service line breaches
    expect(detail.risk.breaches.length).toBe(1)
    expect(detail.risk.score).toBe(2)
  })

  test('reports filter by period, rep, status and category', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/reports')
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export XLS' })).toBeVisible()

    const mgr = await apiAs('manager')
    const filters = await (await mgr.get('/api/reports/filters')).json()
    expect(filters.reps.length).toBeGreaterThan(0)
    expect(filters.categories.length).toBeGreaterThan(0)
    expect(filters.statuses).toContain('pending_approval')

    const all = await (await mgr.get('/api/reports')).json()
    expect(all.summary.count).toBeGreaterThan(0)

    const rep = filters.reps.find((r: any) => r.name === 'Riya Rep')
    const byRep = await (await mgr.get(`/api/reports?repId=${rep.id}`)).json()
    expect(byRep.summary.count).toBeLessThanOrEqual(all.summary.count)
    for (const row of byRep.rows) expect(row.rep).toBe('Riya Rep')

    const byStatus = await (await mgr.get('/api/reports?status=approved')).json()
    for (const row of byStatus.rows) expect(row.status).toBe('approved')

    const cat = filters.categories[0]
    const byCat = await (await mgr.get(`/api/reports?categoryId=${cat.id}`)).json()
    expect(byCat.summary.count).toBeLessThanOrEqual(all.summary.count)

    // a date window in the future returns nothing
    const empty = await (await mgr.get('/api/reports?from=2099-01-01&to=2099-12-31')).json()
    expect(empty.summary.count).toBe(0)
  })

  test('report exports produce real PDF and XLSX files', async () => {
    const mgr = await apiAs('manager')
    const pdf = await mgr.get('/api/reports/export?format=pdf')
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    const pdfBody = await pdf.body()
    expect(pdfBody.subarray(0, 4).toString()).toBe('%PDF')

    const xls = await mgr.get('/api/reports/export?format=xls')
    expect(xls.status()).toBe(200)
    expect(xls.headers()['content-type']).toContain('spreadsheetml')
    const xlsBody = await xls.body()
    expect(xlsBody.subarray(0, 2).toString()).toBe('PK') // xlsx is a zip
  })

  test('deal-health board reports stalled deals, anomalies and slippage (B9)', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/deal-health')
    const mgr = await apiAs('manager')
    const health = await (await mgr.get('/api/dashboard')).json()
    expect(health).toHaveProperty('stalledDays')
    expect(Array.isArray(health.stalled)).toBe(true)
    expect(Array.isArray(health.anomalies)).toBe(true)
    expect(Array.isArray(health.slippage)).toBe(true)
    for (const s of health.stalled) expect(s.daysInactive).toBeGreaterThanOrEqual(health.stalledDays)
    for (const a of health.anomalies) expect(a.riskScore).toBeGreaterThan(a.repAvg)
  })

  test('nudge and escalate actions land on the audit trail', async () => {
    const mgr = await apiAs('manager')
    const health = await (await mgr.get('/api/dashboard')).json()
    const target = health.stalled[0] ?? health.anomalies[0]
    test.skip(!target, 'no alert to act on')
    expect((await mgr.post(`/api/dashboard/quotations/${target.id}/nudge`)).status()).toBe(200)
    expect((await mgr.post(`/api/dashboard/quotations/${target.id}/escalate`)).status()).toBe(200)
    const detail = await (await mgr.get(`/api/approvals/${target.id}`)).json()
    expect(detail.audit.some((a: any) => a.action === 'nudge')).toBe(true)
    expect(detail.audit.some((a: any) => a.action === 'escalate')).toBe(true)
  })

  test('admin can create, edit and delete a warehouse', async () => {
    const admin = await apiAs('admin')
    const name = `E2E Depot ${Date.now()}`
    const created = await admin.post('/api/config/warehouses', {
      data: { name, shippingCostWeight: 3 },
    })
    expect(created.status()).toBe(201)
    const wh = await created.json()
    const patched = await admin.patch(`/api/config/warehouses/${wh.id}`, {
      data: { name: `${name} (edited)`, shippingCostWeight: 4 },
    })
    expect(patched.status()).toBe(200)
    expect((await admin.delete(`/api/config/warehouses/${wh.id}`)).status()).toBe(200)
  })

  test('a duplicate warehouse name gives a readable error, not a raw SQL fault', async () => {
    const admin = await apiAs('admin')
    const existing = await (await admin.get('/api/config/warehouses')).json()
    const res = await admin.post('/api/config/warehouses', {
      data: { name: existing[0].name, shippingCostWeight: 1 },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(String(body.error)).not.toMatch(/duplicate key value violates|pg_|relation "/i)
  })

  test('a draft can be deleted, but a quote with approval history cannot', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()

    const scratch = await (
      await rep.post('/api/quotations', { data: { customerId: customers[0].id } })
    ).json()
    expect((await rep.delete(`/api/quotations/${scratch.id}`)).status()).toBe(200)

    const gold = customers.find((c: any) => c.tier === 'gold')
    const decided = await (
      await rep.post('/api/quotations', { data: { customerId: gold.id } })
    ).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop')
    await rep.post(`/api/quotations/${decided.id}/lines`, {
      data: { productId: laptop.id, quantity: 1, discountPct: 60 },
    })
    await rep.post(`/api/quotations/${decided.id}/submit`)
    const mgr = await apiAs('manager')
    await mgr.post(`/api/approvals/${decided.id}/action`, {
      data: { action: 'return', reason: 'trim it' },
    })
    const res = await rep.delete(`/api/quotations/${decided.id}`)
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/already been through approval/i)
  })
})
