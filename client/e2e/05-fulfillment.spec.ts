import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs, login } from './helpers'

/** An approved quote for a stocked product, ready to allocate. */
async function approvedStockedQuote(rep: APIRequestContext, qty = 2, product = 'Business Laptop') {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const p = products.find((x: any) => x.name === product)
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: p.id, quantity: qty, discountPct: 0 },
  })
  const sub = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
  expect(sub.quotation.status, 'clean quote auto-approves').toBe('approved')
  return q.id as string
}

test.describe.serial('B6 — warehouse split & backorders', () => {
  // These tests consume stock, so put every laptop location back to a known
  // level first — otherwise a second run starts from a depleted warehouse.
  test.beforeAll(async () => {
    const admin = await apiAs('admin')
    const rows = await (await admin.get('/api/config/stock')).json()
    for (const r of rows.filter((x: any) => x.product === 'Business Laptop'))
      await admin.post('/api/config/stock', {
        data: {
          warehouseId: r.warehouseId,
          productId: r.productId,
          quantity: 25,
          reorderLevel: r.reorderLevel,
          targetLevel: r.targetLevel,
        },
      })
  })

  test('stock cannot be allocated before approval', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const customers = await (await rep.get('/api/customers')).json()
    const q = await (await rep.post('/api/quotations', { data: { customerId: customers[0].id } })).json()
    const res = await fin.post(`/api/quotations/${q.id}/fulfillment/accept`)
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/must be approved/i)
  })

  test('suggestion returns a split with shipment count and cost', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedStockedQuote(rep)
    const s = await (await fin.get(`/api/quotations/${id}/fulfillment/suggestion`)).json()
    expect(s.lines.length, 'stocked line produces a suggestion').toBeGreaterThan(0)
    expect(s).toHaveProperty('shipmentCount')
    expect(s).toHaveProperty('estimatedShippingCost')
    const line = s.lines[0]
    const suggested = line.options.reduce((n: number, o: any) => n + o.suggested, 0)
    expect(suggested + line.backordered, 'every unit is either allocated or backordered').toBe(line.needed)
  })

  test('finance accepts the suggested split in the UI and stock is decremented', async ({ page }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedStockedQuote(rep, 2)

    const before = await (await fin.get('/api/fulfillment-queue')).json()
    const laptopStock = (w: any) => w.product === 'Business Laptop'
    const beforeTotal = before.stock.filter(laptopStock).reduce((n: number, s: any) => n + s.available, 0)

    await login(page, 'finance')
    await page.goto(`/quotations/${id}/fulfillment`)
    await expect(page.getByText('Warehouse')).toBeVisible()
    await page.getByRole('button', { name: /Accept.*Split/i }).click()

    await expect(async () => {
      const detail = await (await fin.get(`/api/quotations/${id}`)).json()
      expect(detail.status).toBe('fulfilled')
    }).toPass({ timeout: 15_000 })

    const after = await (await fin.get('/api/fulfillment-queue')).json()
    const afterTotal = after.stock.filter(laptopStock).reduce((n: number, s: any) => n + s.available, 0)
    expect(afterTotal, 'accepting the split consumes stock').toBe(beforeTotal - 2)
  })

  test('a manual override is honoured over the suggestion', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedStockedQuote(rep, 2)
    const s = await (await fin.get(`/api/quotations/${id}/fulfillment/suggestion`)).json()
    const line = s.lines[0]
    // deliberately pick the warehouse the heuristic did NOT choose, if there is one
    const alt = line.options.find((o: any) => o.suggested === 0 && o.available >= 2) ?? line.options[0]
    const res = await fin.post(`/api/quotations/${id}/fulfillment/accept`, {
      data: { allocations: [{ lineId: line.lineId, warehouseId: alt.warehouseId, quantity: 2 }] },
    })
    expect(res.status()).toBe(200)
    const allocs = await res.json()
    expect(allocs.some((a: any) => a.warehouseId === alt.warehouseId && a.quantity === 2)).toBe(true)
  })

  test('over-allocating beyond stock on hand is refused', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedStockedQuote(rep, 1)
    const s = await (await fin.get(`/api/quotations/${id}/fulfillment/suggestion`)).json()
    const line = s.lines[0]
    const res = await fin.post(`/api/quotations/${id}/fulfillment/accept`, {
      data: [{ lineId: line.lineId, warehouseId: line.options[0].warehouseId, quantity: 999_999 }],
    })
    expect([400, 422]).toContain(res.status())
  })

  test('a shortfall produces a backorder row, and consolidate clears it once stock arrives', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const queue = await (await fin.get('/api/fulfillment-queue')).json()
    const rows = queue.stock.filter((s: any) => s.product === 'Business Laptop')
    const onHand = rows.reduce((n: number, s: any) => n + s.available, 0)

    // ask for more than exists anywhere
    const id = await approvedStockedQuote(rep, onHand + 3)
    const accept = await fin.post(`/api/quotations/${id}/fulfillment/accept`)
    expect(accept.status()).toBe(200)
    const allocs = await accept.json()
    const back = allocs.filter((a: any) => a.backordered)
    expect(back.length, 'shortfall is backordered').toBeGreaterThan(0)
    expect(back.reduce((n: number, a: any) => n + a.quantity, 0)).toBe(3)

    // book in a delivery. /fulfillment-queue does not expose stock row ids
    // (only replenishment proposals do), so pull them from the admin config API.
    const admin = await apiAs('admin')
    const stockRows = await (await admin.get('/api/config/stock')).json()
    const target = stockRows.find((r: any) => r.product === 'Business Laptop')
    expect(target, 'a laptop stock row exists').toBeTruthy()
    const recv = await admin.post(`/api/stock/${target.id}/receive`, { data: { quantity: 10 } })
    expect(recv.status(), 'receiving stock').toBe(200)

    const consolidated = await fin.post(`/api/quotations/${id}/fulfillment/consolidate`)
    expect(consolidated.status()).toBe(200)
    const after = await consolidated.json()
    const stillBack = after.filter((a: any) => a.backordered).reduce((n: number, a: any) => n + a.quantity, 0)
    expect(stillBack, 'backorder shrinks once stock arrives').toBeLessThan(3)
  })

  test('services and subscriptions are never treated as a stock shortfall', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await approvedStockedQuote(rep, 1, 'Setup Service')
    const accept = await fin.post(`/api/quotations/${id}/fulfillment/accept`)
    expect(accept.status()).toBe(200)
    const allocs = await accept.json()
    expect(allocs.filter((a: any) => a.backordered).length, 'a service is not backordered').toBe(0)
  })

  test('fulfillment queue screen renders orders, stock and replenishment', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/fulfillment')
    await expect(page.getByText('Stock by warehouse')).toBeVisible()
    await expect(page.getByText('In Stock').first()).toBeVisible()
    const fin = await apiAs('finance')
    const q = await (await fin.get('/api/fulfillment-queue')).json()
    expect(q).toHaveProperty('orders')
    expect(q).toHaveProperty('stock')
    expect(q).toHaveProperty('replenishment')
    for (const r of q.replenishment) expect(r.suggested).toBeGreaterThan(0)
  })
})
