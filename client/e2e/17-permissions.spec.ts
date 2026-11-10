import { test, expect, request } from '@playwright/test'
import { API, PASSWORD, apiAs, login } from './helpers'

test.describe('Data entry beyond the admin', () => {
  test('a rep adds a customer from the New quotation dialog', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/quotations')
    await page.getByRole('button', { name: 'New Quotation' }).click()
    await page.getByRole('button', { name: '+ New customer' }).click()
    const name = `E2E Rep Customer ${Date.now()}`
    await page.getByLabel('Customer name').fill(name)
    await page.getByLabel('Customer email').fill(`rep-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Add customer' }).click()
    // the new customer is selected, so the quote can be created straight away
    await expect(page.getByRole('combobox', { name: 'Customer', exact: true })).toHaveValue(name)
    await page.getByRole('button', { name: 'Create quotation' }).click()
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/)
  })

  test('a rep cannot pick a tier, change one, or delete a customer', async () => {
    const rep = await apiAs('rep')
    const created = await (
      await rep.post('/api/config/customers', {
        data: { name: 'Tier Probe', email: `tier-${Date.now()}@example.com`, tier: 'gold' },
      })
    ).json()
    expect(created.tier, 'rep-created customers start at bronze').toBe('bronze')
    const tierChange = await rep.patch(`/api/config/customers/${created.id}`, { data: { tier: 'gold' } })
    expect(tierChange.status(), 'a rep cannot move a customer up a tier').toBe(403)
    const rename = await rep.patch(`/api/config/customers/${created.id}`, { data: { name: 'Tier Probe 2' } })
    expect((await rename.json()).tier, 'other edits are fine and the tier is untouched').toBe('bronze')
    expect((await rep.delete(`/api/config/customers/${created.id}`)).status()).toBe(403)
    expect((await rep.get('/api/config/products')).status(), 'catalogue stays off-limits').toBe(403)
    // tidy up as admin
    const admin = await apiAs('admin')
    expect((await admin.delete(`/api/config/customers/${created.id}`)).status()).toBe(200)
  })

  test('a manager can add to the catalogue', async () => {
    const mgr = await apiAs('manager')
    const res = await mgr.post('/api/config/categories', { data: { name: `E2E Cat ${Date.now()}` } })
    expect(res.status()).toBe(201)
    const admin = await apiAs('admin')
    await admin.delete(`/api/config/categories/${(await res.json()).id}`)
  })
})

test.describe('Blocking a user', () => {
  test('blocking ends their session at once and stops sign-in; unblocking restores it', async () => {
    const admin = await apiAs('admin')
    const email = `blocked-${Date.now()}@example.com`
    const u = await (
      await admin.post('/api/config/users', { data: { name: 'Block Probe', email, password: PASSWORD, role: 'rep' } })
    ).json()

    const victim = await request.newContext({ baseURL: API })
    expect((await victim.post('/api/auth/login', { data: { email, password: PASSWORD } })).status()).toBe(200)
    expect((await victim.get('/api/auth/me')).status()).toBe(200)

    await admin.patch(`/api/config/users/${u.id}`, { data: { blocked: true } })
    expect((await victim.get('/api/auth/me')).status(), 'existing session stops working').toBe(401)
    const denied = await victim.post('/api/auth/login', { data: { email, password: PASSWORD } })
    expect(denied.status()).toBe(403)
    expect((await denied.json()).error).toMatch(/blocked/i)
    // a wrong password still gets the generic answer, so blocking isn't revealed
    expect((await victim.post('/api/auth/login', { data: { email, password: 'nope-nope' } })).status()).toBe(401)

    await admin.patch(`/api/config/users/${u.id}`, { data: { blocked: false } })
    expect((await victim.post('/api/auth/login', { data: { email, password: PASSWORD } })).status()).toBe(200)
    await admin.delete(`/api/config/users/${u.id}`)
  })

  test('an admin cannot block, demote or delete themselves', async () => {
    const admin = await apiAs('admin')
    const me = await (await admin.get('/api/auth/me')).json()
    expect((await admin.patch(`/api/config/users/${me.id}`, { data: { blocked: true } })).status()).toBe(400)
    expect((await admin.patch(`/api/config/users/${me.id}`, { data: { role: 'rep' } })).status()).toBe(400)
    expect((await admin.delete(`/api/config/users/${me.id}`)).status()).toBe(400)
  })

  test('the Users tab shows status', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Users' }).click()
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
  })
})
