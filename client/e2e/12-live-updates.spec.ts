import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

test.describe('Live updates', () => {
  test('a burst of mutations triggers ONE refetch, not one per mutation', async ({ page }) => {
    await login(page, 'rep')
    await page.goto('/')
    await expect(page.getByText('Pending Approvals')).toBeVisible()

    // count summary refetches on this idle tab
    await page.evaluate(() => {
      ;(window as any).__n = 0
      const of = window.fetch
      window.fetch = function (...a: any[]) {
        if (String(a[0]).includes('/api/summary')) (window as any).__n++
        return of.apply(this, a as any)
      } as any
      const ox = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (m: string, u: string, ...r: any[]) {
        if (String(u).includes('/api/summary')) (window as any).__n++
        return (ox as any).call(this, m, u, ...r)
      } as any
    })

    // a DIFFERENT rep edits their own deal ten times over
    const other = await apiAs('rep2')
    const customers = await (await other.get('/api/customers')).json()
    const q = await (
      await other.post('/api/quotations', { data: { customerId: customers[0].id } })
    ).json()
    const products = await (await other.get('/api/products')).json()
    const p = products.find((x: any) => x.type === 'onetime')
    for (let i = 0; i < 10; i++)
      await other.post(`/api/quotations/${q.id}/lines`, {
        data: { productId: p.id, quantity: 1, discountPct: 0 },
      })

    await page.waitForTimeout(2500)
    const calls = await page.evaluate(() => (window as any).__n)
    expect(calls, `11 mutations caused ${calls} refetches`).toBeLessThanOrEqual(2)
  })

  test('a change still reaches an open list without a manual reload', async ({ page }) => {
    const rep = await apiAs('rep')
    await login(page, 'rep')
    await page.goto('/quotations')

    // the list footer reads "1-10 of N" — N is what must move
    const footer = page.getByText(/of \d+/).first()
    await expect(footer).toBeVisible()
    const before = Number((await footer.textContent())!.match(/of (\d+)/)![1])

    const customers = await (await rep.get('/api/customers')).json()
    await rep.post('/api/quotations', { data: { customerId: customers[0].id } })

    await expect(async () => {
      const now = Number((await footer.textContent())!.match(/of (\d+)/)![1])
      expect(now, 'the new deal arrived on its own').toBe(before + 1)
    }).toPass({ timeout: 15_000 })
  })
})
