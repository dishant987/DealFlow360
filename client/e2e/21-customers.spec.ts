import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

const run = Date.now()

test.describe('Customers', () => {
  test('a rep adds a customer from the Customers page and owns it', async ({ page }) => {
    await login(page, 'rep')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click()
    await expect(page).toHaveURL(/\/customers$/)
    await page.getByRole('button', { name: 'New customer' }).click()
    await page.getByLabel('Name').fill(`Rep Owned ${run}`)
    await page.getByLabel('Email').fill(`owned-${run}@example.com`)
    await page.getByRole('button', { name: 'Add customer' }).click()
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/)
    await expect(page.getByText(/Bronze tier · Net 30 · Owner: Riya Rep/)).toBeVisible()

    // edit and save a field, then add the first contact (it becomes primary)
    await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210')
    await page.getByRole('button', { name: 'Save customer' }).click()
    await expect(page.getByText('Customer saved')).toBeVisible()
    await page.getByLabel('Contact name').fill('Neha Buyer')
    await page.getByLabel('Contact email').fill(`neha-${run}@example.com`)
    await page.getByRole('button', { name: 'Add contact' }).click()
    await expect(page.getByText('Primary', { exact: true })).toBeVisible()
    await expect(page.getByText('Quote links are emailed to the primary contact.')).toBeVisible()
  })

  test("a rep sees another rep's customer read-only, and the API refuses edits", async ({ page }) => {
    const other = await apiAs('rep2')
    const theirs = await (
      await other.post('/api/config/customers', { data: { name: `Dev's ${run}`, email: `devs-${run}@example.com`, tier: 'bronze' } })
    ).json()
    expect(theirs.tier).toBe('bronze')

    const rep = await apiAs('rep')
    expect((await rep.patch(`/api/config/customers/${theirs.id}`, { data: { phone: '1' } })).status()).toBe(403)
    expect((await rep.post(`/api/customers/${theirs.id}/contacts`, { data: { name: 'X' } })).status()).toBe(403)

    await login(page, 'rep')
    await page.goto(`/customers/${theirs.id}`)
    await expect(page.getByText(/Read-only — owned by Dev Rep/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save customer' })).toHaveCount(0)
  })

  test('a manager reassigns the owner, only within the company', async () => {
    const mgr = await apiAs('manager')
    const c = await (
      await mgr.post('/api/config/customers', { data: { name: `Mgr ${run}`, email: `mgr-${run}@example.com`, tier: 'silver' } })
    ).json()
    const reps = (await (await mgr.get('/api/reports/filters')).json()).reps
    const riya = reps.find((r: any) => r.name === 'Riya Rep')
    const ok = await mgr.patch(`/api/config/customers/${c.id}`, { data: { ownerId: riya.id } })
    expect((await ok.json()).ownerId).toBe(riya.id)
    const bad = await mgr.patch(`/api/config/customers/${c.id}`, { data: { ownerId: '00000000-0000-4000-8000-0000000000ff' } })
    expect(bad.status()).toBe(400)
    // and now Riya can edit it
    const rep = await apiAs('rep')
    expect((await rep.patch(`/api/config/customers/${c.id}`, { data: { phone: '2' } })).status()).toBe(200)
  })

  test('quote links go to the primary contact', async () => {
    const rep = await apiAs('rep')
    const c = await (
      await rep.post('/api/config/customers', { data: { name: `Primary ${run}`, email: `account-${run}@example.com`, tier: 'bronze' } })
    ).json()
    await rep.post(`/api/customers/${c.id}/contacts`, { data: { name: 'Second', email: `second-${run}@example.com` } })
    const primary = await (
      await rep.post(`/api/customers/${c.id}/contacts`, { data: { name: 'Main', email: `main-${run}@example.com`, isPrimary: true } })
    ).json()
    const detail = await (await rep.get(`/api/customers/${c.id}`)).json()
    expect(detail.contacts.filter((p: any) => p.isPrimary).map((p: any) => p.id), 'only one primary').toEqual([primary.id])

    const products = await (await rep.get('/api/products')).json()
    const q = await (await rep.post('/api/quotations', { data: { customerId: c.id } })).json()
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: products.find((p: any) => p.name === 'Wireless Mouse').id, quantity: 1, discountPct: 0 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)
    const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()
    expect(sent.sentTo).toBe(`main-${run}@example.com`)
  })
})
