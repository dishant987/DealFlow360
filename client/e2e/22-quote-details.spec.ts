import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { API, apiAs, login } from './helpers'

const run = Date.now()
const DAY = 86_400_000

/** A rep-owned customer on Net 45 with a primary contact, plus one approved quote for it. */
async function setup(rep: APIRequestContext, opts: { pastValid?: boolean } = {}) {
  const c = await (
    await rep.post('/api/config/customers', {
      data: { name: `QD ${run} ${Math.random()}`, email: `qd-${Math.random()}@example.com`, tier: 'bronze', paymentTermsDays: 45 },
    })
  ).json()
  const contact = await (
    await rep.post(`/api/customers/${c.id}/contacts`, { data: { name: 'Priya Purchasing', email: `priya-${Math.random()}@example.com`, isPrimary: true } })
  ).json()
  const q = await (await rep.post('/api/quotations', { data: { customerId: c.id } })).json()
  const mouse = (await (await rep.get('/api/products')).json()).find((p: any) => p.name === 'Wireless Mouse')
  await rep.post(`/api/quotations/${q.id}/lines`, { data: { productId: mouse.id, quantity: 1, discountPct: 0 } })
  if (opts.pastValid) await rep.patch(`/api/quotations/${q.id}`, { data: { validUntil: new Date(Date.now() - DAY).toISOString() } })
  return { c, contact, q }
}

test.describe('Quote details', () => {
  test('a new quote is valid 30 days, on the customer\'s terms, addressed to the primary contact', async () => {
    const rep = await apiAs('rep')
    const { contact, q } = await setup(rep)
    const days = (new Date(q.validUntil).getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(29.9)
    expect(q.paymentTermsDays).toBe(45)
    expect(q.contactId).toBe(contact.id)
  })

  test('the rep fills in details; the portal shows them but never the internal notes', async ({ page }) => {
    const rep = await apiAs('rep')
    const { q } = await setup(rep)
    await login(page, 'rep')
    await page.goto(`/quotations/${q.id}`)
    const panel = page.getByRole('region', { name: 'Quote details' })
    await panel.getByLabel('Customer PO number').fill(`PO-${run}`)
    await panel.getByLabel('Notes to the customer').fill('Delivery within two weeks.')
    await panel.getByLabel('Terms & conditions').fill('Prices exclude freight.')
    await panel.getByLabel(/Internal notes/).fill(`SECRET-${run}`)
    await panel.getByRole('button', { name: 'Save details' }).click()
    await expect(page.getByText('Quote details saved')).toBeVisible()

    await rep.post(`/api/quotations/${q.id}/submit`)
    const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()
    expect(sent.sentTo, 'link goes to the quote contact').toMatch(/^priya-/)

    const portal = await request.newContext({ baseURL: API })
    const view = await (await portal.get(`/api/portal/${sent.portalToken}`)).json()
    expect(view).toMatchObject({ customerPo: `PO-${run}`, paymentTermsDays: 45, contactName: 'Priya Purchasing', expired: false })
    expect(JSON.stringify(view)).not.toContain(`SECRET-${run}`)

    await page.goto(`/portal/${sent.portalToken}`)
    await expect(page.getByText(`PO-${run}`)).toBeVisible()
    await expect(page.getByText('Prices exclude freight.')).toBeVisible()
    await expect(page.getByText(`SECRET-${run}`)).toHaveCount(0)

    // customer-facing details are locked once sent; internal notes are not
    expect((await rep.patch(`/api/quotations/${q.id}`, { data: { customerPo: 'changed' } })).status()).toBe(400)
    expect((await rep.patch(`/api/quotations/${q.id}`, { data: { internalNotes: 'follow up Friday' } })).status()).toBe(200)
  })

  test('an expired quote cannot be sent to the customer', async () => {
    const rep = await apiAs('rep')
    const { q } = await setup(rep, { pastValid: true })
    await rep.post(`/api/quotations/${q.id}/submit`)
    const res = await rep.post(`/api/quotations/${q.id}/send`)
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/expired/)
  })

  test("a contact from another customer is refused, and invoices follow the quote's terms", async () => {
    const rep = await apiAs('rep')
    const a = await setup(rep)
    const b = await setup(rep)
    const wrong = await rep.patch(`/api/quotations/${a.q.id}`, { data: { contactId: b.contact.id } })
    expect(wrong.status()).toBe(400)

    await rep.post(`/api/quotations/${a.q.id}/submit`) // within limits -> approved
    const fin = await apiAs('finance')
    const view = await (await fin.post(`/api/quotations/${a.q.id}/billing/generate`)).json()
    const due = (new Date(view.invoices[0].dueAt).getTime() - Date.now()) / DAY
    expect(due, 'Net 45').toBeGreaterThan(44)
    expect(due).toBeLessThanOrEqual(45)
  })
})
