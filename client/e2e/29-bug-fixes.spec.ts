import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

// Bug-report fixes: tier price lists, yearly pricing, 404.
test('managers keep tier price lists in Settings; negative prices are refused', async ({ page }) => {
  const api = await apiAs('manager')
  const products = await (await api.get('/api/config/products')).json()
  const p = products.find((x: { name: string }) => x.name === 'Docking Station')
  expect((await api.post('/api/config/price-list', { data: { productId: p.id, tier: 'bronze', unitPrice: -5 } })).status()).toBe(400)
  const row = await (await api.post('/api/config/price-list', { data: { productId: p.id, tier: 'bronze', unitPrice: 185 } })).json()
  try {
    await login(page, 'manager')
    await page.goto('/admin?section=prices')
    await expect(page.getByRole('row', { name: /Docking Station.*Bronze.*\$185\.00/ })).toBeVisible()
  } finally {
    await api.delete(`/api/config/price-list/${row.id}`)
  }
})

test('landing pricing switches to yearly (two months free) and unknown pages say 404', async ({ page }) => {
  await page.goto('/#pricing')
  await expect(page.getByText('$39', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: /Yearly/ }).click()
  await expect(page.getByText('$32.50', { exact: true })).toBeVisible()
  await expect(page.getByText('$390 per user, billed yearly')).toBeVisible()
  await page.goto('/no-such-page')
  await expect(page.getByText("There's no page at this address.")).toBeVisible()
})
