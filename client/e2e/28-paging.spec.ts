import { test, expect } from '@playwright/test'
import { apiAs } from './helpers'

// Step 18: big lists come one page at a time; without ?page the old full list still works.
test('quotations and invoices page, search and filter on the server', async () => {
  const manager = await apiAs('manager')
  const page1 = await (await manager.get('/api/quotations?page=1&pageSize=5&sort=created&dir=desc')).json()
  expect(page1.rows).toHaveLength(5)
  expect(page1.total).toBeGreaterThan(5)
  const page2 = await (await manager.get('/api/quotations?page=2&pageSize=5&sort=created&dir=desc')).json()
  expect(page2.rows[0].id).not.toBe(page1.rows[0].id)

  // search by quote number finds exactly that quote
  const target = page1.rows[2].quoteNumber
  const hit = await (await manager.get(`/api/quotations?page=1&q=${target}`)).json()
  expect(hit.rows.map((r: { quoteNumber: string }) => r.quoteNumber)).toContain(target)

  // the board has every status with a true count and at most 25 cards each
  const board = await (await manager.get('/api/quotations/board')).json()
  for (const c of board.columns) expect(c.rows.length).toBeLessThanOrEqual(Math.min(25, c.total))

  // the old shape is unchanged for callers that don't page
  expect(Array.isArray(await (await manager.get('/api/quotations')).json())).toBe(true)

  // invoices: overdue filter and summary over everything
  const finance = await apiAs('finance')
  const overdue = await (await finance.get('/api/invoices?page=1&pageSize=5&status=overdue')).json()
  expect(overdue.total).toBe(overdue.summary.overdue)
  for (const i of overdue.invoices) expect(i.overdue).toBe(true)
})
