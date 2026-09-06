import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'
import type { APIRequestContext } from '@playwright/test'

/** Build a quote whose blended score clears BOTH thresholds (manager → finance). */
async function highRiskQuote(rep: APIRequestContext) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  const setup = products.find((p: any) => p.name === 'Setup Service')
  await rep.post(`/api/quotations/${q.id}/lines`, { data: { productId: laptop.id, quantity: 2, discountPct: 40 } })
  await rep.post(`/api/quotations/${q.id}/lines`, { data: { productId: setup.id, quantity: 1, discountPct: 40 } })
  const submitted = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
  return { id: q.id as string, risk: submitted.risk }
}

test.describe.serial('B4 — discount approval chain', () => {
  test('a high blended score requires manager AND finance', async () => {
    const rep = await apiAs('rep')
    const { risk } = await highRiskQuote(rep)
    expect(risk.requiresManager).toBe(true)
    expect(risk.requiresFinance).toBe(true)
    expect(risk.level).toBe('finance')
  })

  test('finance cannot sign off before the manager has (step ordering)', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const { id } = await highRiskQuote(rep)
    const early = await fin.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })
    expect(early.status(), 'finance must wait for the manager').toBe(403)
  })

  test('manager approves in the UI, then finance approves, and the quote goes approved', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id } = await highRiskQuote(rep)

    await login(page, 'manager')
    await page.goto(`/approvals/${id}`)
    await expect(page.getByText('Blended risk score')).toBeVisible()
    await expect(page.getByText('Approval steps')).toBeVisible()
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('pending_approval') // finance still outstanding
    }).toPass({ timeout: 10_000 })

    await login(page, 'finance')
    await page.goto(`/approvals/${id}`)
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('approved')
    }).toPass({ timeout: 10_000 })
  })

  test('Return for revision puts the quote back to draft and reopens editing', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id } = await highRiskQuote(rep)
    await login(page, 'manager')
    await page.goto(`/approvals/${id}`)
    // the UI requires a reason for reject / return
    await page.getByPlaceholder('Reason (required for reject / return)').fill('Margin too thin — trim the service discount')
    await page.getByRole('button', { name: 'Return for revision' }).click()
    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('draft')
    }).toPass({ timeout: 10_000 })
    // and the rep can edit again
    const edit = await rep.patch(`/api/quotations/${id}`, { data: { orderDiscountPct: '2' } })
    expect(edit.status()).toBe(200)
  })

  test('Reject marks the quote rejected', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id } = await highRiskQuote(rep)
    await login(page, 'manager')
    await page.goto(`/approvals/${id}`)
    await page.getByPlaceholder('Reason (required for reject / return)').fill('Customer walked away')
    await page.getByRole('button', { name: 'Reject' }).click()
    await expect(async () => {
      const detail = await (await rep.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('rejected')
    }).toPass({ timeout: 10_000 })
  })

  test('every decision lands in the audit trail with user and timestamp (A3)', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const { id } = await highRiskQuote(rep)
    await mgr.post(`/api/approvals/${id}/action`, {
      data: { action: 'approve', reason: 'strategic account' },
    })
    const detail = await (await mgr.get(`/api/approvals/${id}`)).json()
    const entry = detail.audit.find((a: any) => a.action === 'approve:manager')
    expect(entry, 'approval is on the audit trail').toBeTruthy()
    expect(entry.user).toBeTruthy()
    expect(entry.reason).toBe('strategic account')
    expect(entry.createdAt).toBeTruthy()
    expect(detail.audit.some((a: any) => a.action === 'submitted')).toBe(true)
    expect(detail.audit.some((a: any) => a.action === 'line_added')).toBe(true)
  })

  test('UI blocks a reject with no reason', async ({ page }) => {
    const rep = await apiAs('rep')
    const { id } = await highRiskQuote(rep)
    await login(page, 'manager')
    await page.goto(`/approvals/${id}`)
    await page.getByRole('button', { name: 'Reject' }).click()
    await expect(page.getByText('Please add a reason')).toBeVisible()
    const detail = await (await rep.get(`/api/quotations/${id}`)).json()
    expect(detail.status).toBe('pending_approval')
  })

  test('approvals list shows counts and only actionable rows carry your step', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/approvals')
    await expect(page.getByRole('columnheader', { name: 'Blended Risk' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Quotation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pending$/ })).toBeVisible()
    const mgr = await apiAs('manager')
    const data = await (await mgr.get('/api/approvals')).json()
    expect(data.summary).toHaveProperty('pending')
    expect(data.summary).toHaveProperty('actionable')
    for (const row of data.rows.filter((r: any) => r.yourStep))
      expect(row.status).toBe('pending_approval')
  })
})
