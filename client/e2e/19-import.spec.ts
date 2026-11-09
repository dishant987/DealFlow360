import { test, expect } from '@playwright/test'
import { apiAs, login } from './helpers'

const run = Date.now()
const b64 = (s: string) => Buffer.from(s).toString('base64')

test.describe('Bulk import', () => {
  test('a manager previews customers, sees a bad row block the import, then imports the fixed file', async ({ page }) => {
    await login(page, 'manager')
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'Customers' }).click()
    await page.getByRole('button', { name: 'Import' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('link', { name: 'Download the template' })).toHaveAttribute(
      'href',
      '/api/config/import/customers/template',
    )

    const bad = `name,email,tier\nUI One ${run},ui1-${run}@example.com,silver\nUI Two ${run},not-an-email,\n`
    await dialog.getByLabel('Spreadsheet file').setInputFiles({ name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) })
    await expect(dialog.getByText('email is not a valid email')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Import \d+ customers$/ })).toBeDisabled()

    const good = `name,email,tier\nUI One ${run},ui1-${run}@example.com,silver\nUI Two ${run},ui2-${run}@example.com,\n`
    await dialog.getByLabel('Spreadsheet file').setInputFiles({ name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(good) })
    await expect(dialog.getByText(/2\s*new/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Import 2 customers' }).click()
    await expect(page.getByText(/Imported: 2 added/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const mgr = await apiAs('manager')
    const all = await (await mgr.get('/api/config/customers')).json()
    const mine = all.filter((c: any) => c.email.endsWith(`-${run}@example.com`))
    expect(mine.map((c: any) => [c.email.split('-')[0], c.tier]).sort()).toEqual([
      ['ui1', 'silver'],
      ['ui2', 'bronze'],
    ])
  })

  test('an import with any bad row writes nothing', async () => {
    const mgr = await apiAs('manager')
    const csv = `name,email\nGood ${run},atomic-${run}@example.com\n,missing-name-${run}@example.com\n`
    const res = await mgr.post('/api/config/import/customers', {
      data: { filename: 'c.csv', data: b64(csv), commit: true },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).summary).toMatchObject({ create: 1, error: 1 })
    const all = await (await mgr.get('/api/config/customers')).json()
    expect(all.some((c: any) => c.email === `atomic-${run}@example.com`), 'nothing was written').toBe(false)
  })

  test('products: category by name, then skip existing SKUs on a second import', async () => {
    const mgr = await apiAs('manager')
    const csv = `name,sku,category,unit_price,unit_cost,type\nImport Cable ${run},IMP-${run},hardware,12.50,4,onetime\n`
    const first = await (
      await mgr.post('/api/config/import/products', { data: { filename: 'p.csv', data: b64(csv), commit: true } })
    ).json()
    expect(first.summary).toEqual({ create: 1, update: 0, skip: 0, error: 0 })

    const again = await (
      await mgr.post('/api/config/import/products', { data: { filename: 'p.csv', data: b64(csv), mode: 'skip' } })
    ).json()
    expect(again.summary).toMatchObject({ create: 0, skip: 1 })

    const products = await (await mgr.get('/api/config/products')).json()
    const p = (products.rows ?? products).find((x: any) => x.sku === `IMP-${run}`)
    expect(p).toMatchObject({ name: `Import Cable ${run}`, category: 'Hardware' })
    const admin = await apiAs('admin')
    expect((await admin.delete(`/api/config/products/${p.id}`)).status()).toBe(200)
  })

  test('reps cannot bulk import, and bad files are refused clearly', async () => {
    const rep = await apiAs('rep')
    const body = { data: { filename: 'c.csv', data: b64('name,email\nX,x@example.com\n') } }
    expect((await rep.post('/api/config/import/customers', body)).status()).toBe(403)
    expect((await rep.get('/api/config/import/customers/template')).status()).toBe(403)

    const mgr = await apiAs('manager')
    const pdf = await mgr.post('/api/config/import/customers', { data: { filename: 'c.pdf', data: b64('x') } })
    expect(pdf.status()).toBe(400)
    const empty = await mgr.post('/api/config/import/customers', { data: { filename: 'c.csv', data: b64('name,email\n') } })
    expect((await empty.json()).error).toMatch(/No rows/)
    const tpl = await mgr.get('/api/config/import/products/template')
    expect(tpl.headers()['content-type']).toMatch(/text\/csv/)
    expect((await tpl.text()).split('\n')[0]).toContain('unit_price')
  })
})
