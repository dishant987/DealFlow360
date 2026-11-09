import { describe, expect, it } from 'vitest'
import { normaliseHeader, planImport, templateCsv, type Lookups } from './import.js'

const lk = (): Lookups => ({
  customersByEmail: new Map([['acme@x.com', 'c1']]),
  productsBySku: new Map([['hw-1', 'p1']]),
  categoriesByName: new Map([['hardware', 'cat1']]),
  plansByName: new Map([['monthly support', 'plan1']]),
})

describe('planImport — customers', () => {
  it('creates new rows (defaulting to bronze) and updates or skips existing ones', () => {
    const rows = [
      { name: 'Acme', email: 'ACME@x.com', tier: 'gold' },
      { name: 'Beta', email: 'beta@x.com', tier: '' },
    ]
    const up = planImport('customers', rows, lk(), 'update')
    expect(up.summary).toEqual({ create: 1, update: 1, skip: 0, error: 0 })
    expect(up.rows[0]).toMatchObject({ row: 2, action: 'update', id: 'c1', values: { email: 'acme@x.com', tier: 'gold' } })
    expect(up.rows[1].values?.tier).toBe('bronze')
    expect(planImport('customers', rows, lk(), 'skip').rows[0].action).toBe('skip')
  })

  it('reports every problem on a row, and duplicates within the file', () => {
    const r = planImport(
      'customers',
      [
        { name: '', email: 'not-an-email', tier: 'platinum' },
        { name: 'One', email: 'dup@x.com' },
        { name: 'Two', email: 'DUP@x.com' },
      ],
      lk(),
      'update',
    )
    expect(r.rows[0].errors).toEqual([
      'name is required',
      'email is not a valid email',
      'tier must be bronze, silver or gold',
    ])
    expect(r.rows[1].action).toBe('create')
    expect(r.rows[2].errors[0]).toMatch(/duplicate of row 3/)
    expect(r.summary.error).toBe(2)
  })

  it('ignores blank lines but keeps spreadsheet row numbers', () => {
    const r = planImport('customers', [{ name: '', email: '' }, { name: 'C', email: 'c@x.com' }], lk(), 'update')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].row).toBe(3)
  })
})

describe('planImport — products', () => {
  it('resolves category and plan by name, case-insensitively', () => {
    const r = planImport(
      'products',
      [
        { name: 'Laptop', sku: 'HW-1', category: 'HARDWARE', unit_price: '1000', unit_cost: '700', type: '' },
        {
          name: 'Support',
          sku: 'SUB-1',
          category: 'hardware',
          unit_price: '50',
          unit_cost: '20',
          type: 'Subscription',
          subscription_plan: 'Monthly Support',
          tax_rate: '18',
        },
      ],
      lk(),
      'update',
    )
    expect(r.rows[0]).toMatchObject({ action: 'update', id: 'p1', values: { categoryId: 'cat1', type: 'onetime' } })
    expect(r.rows[1]).toMatchObject({
      action: 'create',
      values: { type: 'subscription', subscriptionPlanId: 'plan1', taxRate: '18' },
    })
  })

  it('rejects unknown categories, bad money, missing plans and bad tax rates', () => {
    const r = planImport(
      'products',
      [
        { name: 'X', sku: 'X1', category: 'Toys', unit_price: '12,50', unit_cost: '-1', type: 'subscription', tax_rate: '150' },
      ],
      lk(),
      'update',
    )
    expect(r.rows[0].errors).toEqual([
      'category "Toys" doesn\'t exist',
      'unit_price must be a number like 1200 or 99.50',
      'unit_cost must be a number like 1200 or 99.50',
      'tax_rate must be between 0 and 100',
      'subscription_plan is required for a subscription product',
    ])
  })
})

describe('helpers', () => {
  it('normalises headers and builds templates', () => {
    expect(normaliseHeader(' Unit Price ')).toBe('unit_price')
    expect(normaliseHeader('Tax-Rate')).toBe('tax_rate')
    expect(templateCsv('customers')).toBe('name,email,tier\nAcme Corp,buyer@acme.com,silver\n')
    expect(templateCsv('products').split('\n')[0]).toBe(
      'name,sku,category,unit_price,unit_cost,type,unit,tax_rate,description,subscription_plan',
    )
  })
})
