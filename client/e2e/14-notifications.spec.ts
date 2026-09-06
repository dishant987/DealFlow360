import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiAs, login } from './helpers'

async function quoteFor(rep: APIRequestContext, discountPct: number) {
  const customers = await (await rep.get('/api/customers')).json()
  const gold = customers.find((c: any) => c.tier === 'gold')
  const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
  const products = await (await rep.get('/api/products')).json()
  const laptop = products.find((p: any) => p.name === 'Business Laptop')
  await rep.post(`/api/quotations/${q.id}/lines`, {
    data: { productId: laptop.id, quantity: 2, discountPct },
  })
  await rep.post(`/api/quotations/${q.id}/submit`)
  return q.id as string
}

test.describe('Notifications', () => {
  test('the bell shows an unread count and lists what happened', async ({ page }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    // something happens TO the rep, done by someone else
    const id = await quoteFor(rep, 40)
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })

    await login(page, 'rep')
    const bell = page.getByRole('button', { name: /^Notifications/ })
    await expect(bell).toBeVisible()
    await expect(bell, 'unread badge').toHaveAccessibleName(/\d+ unread/)

    await bell.click()
    const menu = page.getByRole('menu')
    await expect(menu.getByText('Notifications')).toBeVisible()
    await expect(menu.getByText('Approved by the sales manager').first()).toBeVisible()
  })

  test('clicking a notification opens the quotation it is about', async ({ page }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const id = await quoteFor(rep, 40)
    await mgr.post(`/api/approvals/${id}/action`, {
      data: { action: 'return', reason: 'trim the service line' },
    })

    await login(page, 'rep')
    await page.getByRole('button', { name: /^Notifications/ }).click()
    const menu = page.getByRole('menu')
    // the approver's reason is carried through, not just the verb
    await expect(menu.getByText(/trim the service line/).first()).toBeVisible()
    await menu.getByText('Returned for revision').first().click()
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/)
  })

  test('"Mark all read" clears the badge and it stays cleared', async ({ page }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const id = await quoteFor(rep, 40)
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })

    await login(page, 'rep')
    const bell = page.getByRole('button', { name: /^Notifications/ })
    await bell.click()
    await page.getByRole('menu').getByRole('button', { name: 'Mark all read' }).click()
    // the open menu is modal — it aria-hides the trigger, so close it first
    await page.keyboard.press('Escape')
    await expect(bell).toHaveAccessibleName('Notifications')

    // survives a reload — the stamp is persisted, not just component state
    await page.reload()
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveAccessibleName(
      'Notifications',
    )
  })

  test('a new event after marking read raises the badge again', async ({ page }) => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    await login(page, 'rep')

    const bell = page.getByRole('button', { name: /^Notifications/ })
    await bell.click()
    const markAll = page.getByRole('menu').getByRole('button', { name: 'Mark all read' })
    if (await markAll.isVisible().catch(() => false)) await markAll.click()
    await page.keyboard.press('Escape')
    await expect(bell).toHaveAccessibleName('Notifications')

    // now something new happens to this rep
    const id = await quoteFor(rep, 40)
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })

    await expect(bell, 'live update raises the badge').toHaveAccessibleName(/1 unread/, {
      timeout: 20_000,
    })
  })

  test('nobody is notified about their own actions', async () => {
    const mgr = await apiAs('manager')
    const rep = await apiAs('rep')
    const id = await quoteFor(rep, 40)
    await mgr.post(`/api/approvals/${id}/action`, { data: { action: 'approve' } })

    const mine = await (await mgr.get('/api/notifications')).json()
    expect(
      mine.some((n: any) => n.quotationId === id && n.title.includes('Approved')),
      'the manager who approved is not told about it',
    ).toBe(false)

    const theirs = await (await rep.get('/api/notifications')).json()
    expect(
      theirs.some((n: any) => n.quotationId === id && n.title.includes('Approved')),
      'the rep who owns the deal IS told',
    ).toBe(true)
  })

  test('a rep is only notified about their own deals', async () => {
    const rep = await apiAs('rep')
    const rep2 = await apiAs('rep2')
    const mine = new Set(
      ((await (await rep.get('/api/quotations')).json()) as any[]).map((q) => q.id),
    )
    const notes = await (await rep.get('/api/notifications')).json()
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) expect(mine.has(n.quotationId), `${n.quoteNumber} is theirs`).toBe(true)

    // and the other rep's feed is genuinely different
    const others = await (await rep2.get('/api/notifications')).json()
    const overlap = others.filter((n: any) => mine.has(n.quotationId))
    expect(overlap, "no cross-rep bleed").toEqual([])
  })

  test('an approver is notified about work arriving, a rep is not', async () => {
    const rep = await apiAs('rep')
    const mgr = await apiAs('manager')
    const id = await quoteFor(rep, 40) // submitted → needs approval

    const approver = await (await mgr.get('/api/notifications')).json()
    expect(
      approver.some((n: any) => n.quotationId === id && n.title === 'Submitted for approval'),
      'the manager sees it arrive',
    ).toBe(true)

    const theirs = await (await rep.get('/api/notifications')).json()
    expect(
      theirs.some((n: any) => n.title === 'Submitted for approval'),
      'the rep is not told about their own submission',
    ).toBe(false)
  })

  test('a customer portal action reaches the rep, attributed to the customer', async () => {
    const rep = await apiAs('rep')
    const customers = await (await rep.get('/api/customers')).json()
    const gold = customers.find((c: any) => c.tier === 'gold')
    const q = await (await rep.post('/api/quotations', { data: { customerId: gold.id } })).json()
    const products = await (await rep.get('/api/products')).json()
    const laptop = products.find((p: any) => p.name === 'Business Laptop')
    await rep.post(`/api/quotations/${q.id}/lines`, {
      data: { productId: laptop.id, quantity: 1, discountPct: 0 },
    })
    await rep.post(`/api/quotations/${q.id}/submit`)
    const sent = await (await rep.post(`/api/quotations/${q.id}/send`)).json()

    const anon = await apiAs('rep')
    await anon.post(`/api/portal/${sent.portalToken}/negotiate`, {
      data: { type: 'comment', message: 'any chance of a better price?' },
    })

    const notes = await (await rep.get('/api/notifications')).json()
    const hit = notes.find((n: any) => n.quotationId === q.id)
    expect(hit, 'the portal comment reached the rep').toBeTruthy()
    expect(hit.title).toBe('Customer left a comment')
    // a portal action has no internal user behind it
    expect(hit.actor).toBe('the customer')
  })
})
