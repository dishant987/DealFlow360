import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db, pool } from './config/db.js'
import * as s from './models/schema.js'

// Reseed: wipe in FK-safe order, then insert sample data.
async function wipe() {
  await db.delete(s.negotiationRequests)
  await db.delete(s.creditNotes)
  await db.delete(s.payments)
  await db.delete(s.billingSchedules)
  await db.delete(s.invoices)
  await db.delete(s.fulfillmentAllocations)
  await db.delete(s.auditLog)
  await db.delete(s.approvals)
  await db.delete(s.quoteLines)
  await db.delete(s.quotations)
  await db.delete(s.productPairings)
  await db.delete(s.stock)
  await db.delete(s.priceListItems)
  await db.delete(s.categoryDiscountCeilings)
  await db.delete(s.products)
  await db.delete(s.subscriptionPlans)
  await db.delete(s.discountTiers)
  await db.delete(s.warehouses)
  await db.delete(s.categories)
  await db.delete(s.customers)
  await db.delete(s.users)
  await db.delete(s.appSettings)
}

async function seed() {
  await wipe()

  // settings (singleton row; defaults apply)
  await db.insert(s.appSettings).values({})

  // users (all share password "password123")
  const pw = await bcrypt.hash('password123', 10)
  await db.insert(s.users).values([
    { name: 'Riya Rep', email: 'rep@dealflow.com', passwordHash: pw, role: 'rep' },
    { name: 'Manoj Manager', email: 'manager@dealflow.com', passwordHash: pw, role: 'manager' },
    { name: 'Farah Finance', email: 'finance@dealflow.com', passwordHash: pw, role: 'finance' },
    { name: 'Aditi Admin', email: 'admin@dealflow.com', passwordHash: pw, role: 'admin' },
  ])

  // customers
  await db.insert(s.customers).values([
    { name: 'Acme Corp', email: 'buyer@acme.com', tier: 'gold' },
    { name: 'Beta Industries', email: 'buyer@beta.com', tier: 'silver' },
    { name: 'Gamma LLC', email: 'buyer@gamma.com', tier: 'bronze' },
  ])

  // categories
  const [hardware, services, subs] = await db
    .insert(s.categories)
    .values([{ name: 'Hardware' }, { name: 'Services' }, { name: 'Subscriptions' }])
    .returning({ id: s.categories.id })

  // subscription plan
  const [monthly] = await db
    .insert(s.subscriptionPlans)
    .values({
      name: 'Monthly Support',
      interval: 'monthly',
      prorationEnabled: true,
      cancellationRefundPct: '50',
    })
    .returning({ id: s.subscriptionPlans.id })

  // products
  const [laptop, setup, mouse, warranty, support] = await db
    .insert(s.products)
    .values([
      { name: 'Business Laptop', sku: 'HW-LAPTOP', categoryId: hardware.id, type: 'onetime', unitPrice: '1000', unitCost: '700', taxRate: '18' },
      { name: 'Setup Service', sku: 'SVC-SETUP', categoryId: services.id, type: 'onetime', unitPrice: '200', unitCost: '150', taxRate: '18' },
      { name: 'Wireless Mouse', sku: 'HW-MOUSE', categoryId: hardware.id, type: 'onetime', unitPrice: '40', unitCost: '20', taxRate: '18' },
      { name: 'Extended Warranty', sku: 'SVC-WARRANTY', categoryId: services.id, type: 'onetime', unitPrice: '100', unitCost: '30', taxRate: '18', isPromoted: true },
      { name: 'Support Plan', sku: 'SUB-SUPPORT', categoryId: subs.id, type: 'subscription', unitPrice: '50', unitCost: '20', taxRate: '18', subscriptionPlanId: monthly.id },
    ])
    .returning({ id: s.products.id })

  // tier price override (gold gets cheaper laptop)
  await db.insert(s.priceListItems).values([
    { productId: laptop.id, tier: 'gold', unitPrice: '950' },
  ])

  // discount governance
  await db.insert(s.discountTiers).values([
    { tier: 'bronze', maxDiscountPct: '5' },
    { tier: 'silver', maxDiscountPct: '10' },
    { tier: 'gold', maxDiscountPct: '15' },
  ])
  await db.insert(s.categoryDiscountCeilings).values([
    { categoryId: hardware.id, maxDiscountPct: '15' },
    { categoryId: services.id, maxDiscountPct: '10' },
    { categoryId: subs.id, maxDiscountPct: '10' },
  ])

  // warehouses + stock (laptop split-able across two)
  const [main, east] = await db
    .insert(s.warehouses)
    .values([
      { name: 'Main Warehouse', shippingCostWeight: '1' },
      { name: 'East Depot', shippingCostWeight: '1.5' },
    ])
    .returning({ id: s.warehouses.id })

  await db.insert(s.stock).values([
    { warehouseId: main.id, productId: laptop.id, quantity: 8, reorderLevel: 3 },
    { warehouseId: east.id, productId: laptop.id, quantity: 5, reorderLevel: 2 },
    { warehouseId: main.id, productId: mouse.id, quantity: 50, reorderLevel: 10 },
    { warehouseId: east.id, productId: mouse.id, quantity: 20, reorderLevel: 5 },
  ])

  // upsell pairings (Laptop → ...)
  await db.insert(s.productPairings).values([
    { productId: laptop.id, suggestedProductId: mouse.id, score: 10 },
    { productId: laptop.id, suggestedProductId: warranty.id, score: 8 },
    { productId: laptop.id, suggestedProductId: support.id, score: 5 },
  ])

  console.log('✔ seed complete')
}

seed()
  .catch((e) => {
    console.error('seed failed:', e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
