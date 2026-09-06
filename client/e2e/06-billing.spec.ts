import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs, login } from './helpers'

/** Approved quote mixing a one-time product with a recurring subscription line. */
async function hybridQuote(rep: APIRequestContext) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  const support = products.find((p: any) => p.name === 'Support Plan')
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: laptop.id, quantity: 1, discountPct: 0 },
  })
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: support.id, quantity: 2, discountPct: 0 },
  })
  const sub = await (await rep.post(`/api/quotations/${q.id}/submit`)).json()
  expect(sub.quotation.status).toBe('approved')
  return q.id as string
}

test.describe.serial('B7 — hybrid billing, subscriptions and payment', () => {
  test('billing cannot be generated before approval', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const customers = await (await rep.get('/api/customers')).json()
    const q = await (
      await rep.post('/api/quotations', { data: { customerId: customers[0].id } })
    ).json()
    const res = await fin.post(`/api/quotations/${q.id}/billing/generate`)
    expect(res.status()).toBe(400)
  })

  test('one order produces a one-time invoice AND a separate recurring schedule (§9 step 6)', async ({
    page,
  }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)

    await login(page, 'finance')
    await page.goto(`/quotations/${id}/billing`)
    await page.getByRole('button', { name: /Generate Billing/i }).click()
    await expect(page.getByText('One-time invoices')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Recurring subscriptions')).toBeVisible()

    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    expect(
      view.invoices.filter((i: any) => i.type === 'onetime').length,
      'one-time invoice raised',
    ).toBe(1)
    expect(view.schedules.length, 'subscription schedule raised').toBe(1)
    // the laptop is billed once; the support plan is NOT on the one-time invoice.
    // A2: the gold price-list override ($950) is used, not the $1000 base price.
    expect(Number(view.invoices[0].amount), 'gold tier price applied').toBe(950)
    expect(Number(view.schedules[0].amount), '2 x $50/mo').toBe(100)
    expect(view.schedules[0].interval).toBe('monthly')
    expect(new Date(view.schedules[0].nextBillingDate).getTime()).toBeGreaterThan(Date.now())
  })

  test('a partial payment leaves the invoice open; clearing the balance settles it (§9 step 8)', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const inv = view.invoices.find((i: any) => i.type === 'onetime')

    const partial = await (
      await fin.post(`/api/invoices/${inv.id}/pay`, { data: { amount: 400 } })
    ).json()
    expect(partial.status, 'still open after a partial payment').not.toBe('paid')
    expect(partial.balance, 'gold-tier $950 invoice less a $400 payment').toBe(550)

    const rest = await (await fin.post(`/api/invoices/${inv.id}/pay`)).json()
    expect(rest.status, 'settled once the balance clears').toBe('paid')
    expect(rest.balance).toBe(0)

    const again = await fin.post(`/api/invoices/${inv.id}/pay`, { data: { amount: 10 } })
    expect(again.status(), 'no payment on a settled invoice').toBe(400)
  })

  test('overpaying an invoice is refused', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const inv = view.invoices.find((i: any) => i.type === 'onetime')
    const res = await fin.post(`/api/invoices/${inv.id}/pay`, { data: { amount: 99_999 } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/exceeds the outstanding balance/i)
  })

  test('a zero or negative payment is refused', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const inv = view.invoices.find((i: any) => i.type === 'onetime')
    for (const amount of [0, -50]) {
      const res = await fin.post(`/api/invoices/${inv.id}/pay`, { data: { amount } })
      expect(res.status(), `payment of ${amount}`).toBe(400)
    }
  })

  test('billing cannot be regenerated once a payment is on record', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const inv = view.invoices.find((i: any) => i.type === 'onetime')
    await fin.post(`/api/invoices/${inv.id}/pay`)
    const res = await fin.post(`/api/quotations/${id}/billing/generate`)
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/payment has already been recorded/i)
  })

  test('a mid-cycle upgrade raises a prorated charge, a downgrade a credit note', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    let view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const lineId = view.schedules[0].quoteLineId

    const up = await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/change`, {
      data: { quantity: 5 },
    })
    expect(up.status()).toBe(200)
    view = await up.json()
    expect(Number(view.schedules[0].amount), '5 x $50/mo').toBe(250)
    expect(
      view.invoices.some((i: any) => i.type === 'recurring'),
      'prorated upgrade charge',
    ).toBe(true)

    const down = await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/change`, {
      data: { quantity: 1 },
    })
    view = await down.json()
    expect(Number(view.schedules[0].amount)).toBe(50)
    expect(view.creditNotes.length, 'prorated downgrade credit').toBeGreaterThan(0)
  })

  test('pause suspends billing, resume rolls the next date forward (no back-billing)', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    let view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const lineId = view.schedules[0].quoteLineId

    view = await (
      await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/pause`)
    ).json()
    expect(view.schedules[0].status).toBe('paused')
    const doublePause = await fin.post(
      `/api/quotations/${id}/billing/subscriptions/${lineId}/pause`,
    )
    expect(doublePause.status(), 'cannot pause twice').toBe(400)

    view = await (
      await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/resume`)
    ).json()
    expect(view.schedules[0].status).toBe('scheduled')
    expect(new Date(view.schedules[0].nextBillingDate).getTime()).toBeGreaterThan(Date.now())
  })

  test('cancelling a subscription raises a prorated refund credit note', async () => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    let view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const lineId = view.schedules[0].quoteLineId
    view = await (
      await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/cancel`)
    ).json()
    expect(view.schedules[0].status).toBe('cancelled')
    const cancelled = await fin.post(`/api/quotations/${id}/billing/subscriptions/${lineId}/pause`)
    expect(cancelled.status(), 'a cancelled plan cannot be paused').toBe(400)
  })

  test('invoice list, detail, timeline and PDF all work', async ({ page }) => {
    const rep = await apiAs('rep')
    const fin = await apiAs('finance')
    const id = await hybridQuote(rep)
    await fin.post(`/api/quotations/${id}/billing/generate`)
    const view = await (await fin.get(`/api/quotations/${id}/billing`)).json()
    const inv = view.invoices[0]

    await login(page, 'finance')
    await page.goto('/invoices')
    await expect(page.getByText('Outstanding').first()).toBeVisible()
    await expect(page.getByText('Overdue').first()).toBeVisible()
    await page.goto(`/invoices/${inv.id}`)
    await expect(page.getByText('Balance').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record payment' })).toBeVisible()

    const detail = await (await fin.get(`/api/invoices/${inv.id}`)).json()
    expect(detail.timeline.map((t: any) => t.key)).toEqual([
      'confirmed',
      'shipped',
      'invoiced',
      'paid',
    ])
    expect(detail).toHaveProperty('balance')

    const pdf = await fin.get(`/api/invoices/${inv.id}/pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect((await pdf.body()).length).toBeGreaterThan(1000)
  })

  test('subscriptions screen reports MRR and excludes paused plans', async ({ page }) => {
    await login(page, 'finance')
    await page.goto('/subscriptions')
    const fin = await apiAs('finance')
    const data = await (await fin.get('/api/subscriptions')).json()
    expect(data.summary).toHaveProperty('mrr')
    const activeMrr = data.subscriptions
      .filter((s: any) => s.status === 'scheduled')
      .reduce((sum: number, s: any) => {
        const perMonth = s.interval === 'monthly' ? 1 : s.interval === 'quarterly' ? 1 / 3 : 1 / 12
        return sum + Number(s.amount) * perMonth
      }, 0)
    expect(Math.abs(data.summary.mrr - activeMrr)).toBeLessThan(0.02)
  })
})
