import 'dotenv/config'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { sql } from 'drizzle-orm'
import { db, pool } from './config/db.js'
import * as s from './models/schema.js'
import { computeBlendedRisk } from './services/risk.js'
import { computeLine } from './services/pricing.js'
import { nextBillingDate, type Interval } from './services/billing.js'
import { quoteNumber } from './services/quoteNumber.js'

/*
  Reseed: wipe in FK-safe order, insert the reference catalogue, then build a
  demo pipeline on top of it.

  The demo deals exist so every screen has something to show on a fresh database —
  Kanban, Approvals, Deal Health, Invoices, Subscriptions and Reports are all
  empty without them. Scores, totals and billing dates are computed with the same
  service functions the app uses, never typed in by hand, so the seeded numbers
  always agree with what the app would recalculate.

  Two things are deliberately left alone because TESTING.md pins them:
    - Business Laptop stock stays Main 8 / East 5
    - the only laptop price-list override stays gold @ $950
  No demo deal allocates laptop stock. Backorders use the 4K Monitor instead.
*/

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
  await db.delete(s.productVariants)
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
  // DELETE leaves the serial sequences where they were, so a reseeded database
  // would start at QT-2026-0093. Restart them for a clean demo.
  await db.execute(sql`ALTER SEQUENCE quotations_seq_no_seq RESTART WITH 1`)
  await db.execute(sql`ALTER SEQUENCE invoices_seq_no_seq RESTART WITH 1`)
}

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)
const money = (n: number) => String(Math.round(n * 100) / 100)

async function seed() {
  await wipe()

  /* ------------------------------------------------------------------ */
  /* Reference data                                                      */
  /* ------------------------------------------------------------------ */

  await db.insert(s.appSettings).values({})

  // every account shares the password "password123"
  const pw = await bcrypt.hash('password123', 10)
  const [riya, manoj, farah, aditi, dev, sana] = await db
    .insert(s.users)
    .values([
      { name: 'Riya Rep', email: 'rep@dealflow.com', passwordHash: pw, role: 'rep' },
      { name: 'Manoj Manager', email: 'manager@dealflow.com', passwordHash: pw, role: 'manager' },
      { name: 'Farah Finance', email: 'finance@dealflow.com', passwordHash: pw, role: 'finance' },
      { name: 'Aditi Admin', email: 'admin@dealflow.com', passwordHash: pw, role: 'admin' },
      // a second and third rep: needed for per-rep report filters, and so the
      // discount-anomaly detector has more than one baseline to compare against
      { name: 'Dev Rep', email: 'dev@dealflow.com', passwordHash: pw, role: 'rep' },
      { name: 'Sana Rep', email: 'sana@dealflow.com', passwordHash: pw, role: 'rep' },
    ])
    .returning()

  const [acme, beta, gamma, nova, zenith, delta, orion] = await db
    .insert(s.customers)
    .values([
      { name: 'Acme Corp', email: 'buyer@acme.com', tier: 'gold' },
      { name: 'Beta Industries', email: 'buyer@beta.com', tier: 'silver' },
      { name: 'Gamma LLC', email: 'buyer@gamma.com', tier: 'bronze' },
      { name: 'Nova Retail', email: 'buyer@novaretail.com', tier: 'gold' },
      { name: 'Zenith Co', email: 'buyer@zenithco.com', tier: 'silver' },
      { name: 'Delta LLC', email: 'buyer@delta.com', tier: 'bronze' },
      { name: 'Orion Ltd', email: 'buyer@orion.com', tier: 'gold' },
    ])
    .returning()

  const [hardware, services, subs] = await db
    .insert(s.categories)
    .values([{ name: 'Hardware' }, { name: 'Services' }, { name: 'Subscriptions' }])
    .returning()

  // three plans so all three intervals are exercised, including one with
  // proration switched OFF (a mid-cycle change there takes effect next period)
  const [monthlyPlan, quarterlyPlan, annualPlan] = await db
    .insert(s.subscriptionPlans)
    .values([
      { name: 'Monthly Support', interval: 'monthly', prorationEnabled: true, cancellationRefundPct: '50' },
      { name: 'Quarterly SLA', interval: 'quarterly', prorationEnabled: true, cancellationRefundPct: '25' },
      { name: 'Annual Enterprise', interval: 'yearly', prorationEnabled: false, cancellationRefundPct: '0' },
    ])
    .returning()

  const [laptop, setup, mouse, warranty, support, docking, monitor, training, carePlan, premiumSla, enterprise] =
    await db
      .insert(s.products)
      .values([
        { name: 'Business Laptop', sku: 'HW-LAPTOP', categoryId: hardware.id, type: 'onetime', unitPrice: '1000', unitCost: '700', taxRate: '18' },
        { name: 'Setup Service', sku: 'SVC-SETUP', categoryId: services.id, type: 'onetime', unitPrice: '200', unitCost: '150', taxRate: '18' },
        { name: 'Wireless Mouse', sku: 'HW-MOUSE', categoryId: hardware.id, type: 'onetime', unitPrice: '40', unitCost: '20', taxRate: '18' },
        { name: 'Extended Warranty', sku: 'SVC-WARRANTY', categoryId: services.id, type: 'onetime', unitPrice: '100', unitCost: '30', taxRate: '18', isPromoted: true },
        { name: 'Support Plan', sku: 'SUB-SUPPORT', categoryId: subs.id, type: 'subscription', unitPrice: '50', unitCost: '20', taxRate: '18', subscriptionPlanId: monthlyPlan.id },
        { name: 'Docking Station', sku: 'HW-DOCK', categoryId: hardware.id, type: 'onetime', unitPrice: '180', unitCost: '110', taxRate: '18', isPromoted: true },
        { name: '4K Monitor', sku: 'HW-MON4K', categoryId: hardware.id, type: 'onetime', unitPrice: '450', unitCost: '300', taxRate: '18' },
        { name: 'Onsite Training', sku: 'SVC-TRAIN', categoryId: services.id, type: 'onetime', unitPrice: '800', unitCost: '500', taxRate: '18' },
        { name: 'Care Plan 2yr', sku: 'SUB-CARE2', categoryId: subs.id, type: 'subscription', unitPrice: '46', unitCost: '18', taxRate: '18', subscriptionPlanId: monthlyPlan.id },
        { name: 'Premium SLA', sku: 'SUB-SLA', categoryId: subs.id, type: 'subscription', unitPrice: '300', unitCost: '120', taxRate: '18', subscriptionPlanId: quarterlyPlan.id },
        { name: 'Enterprise Support', sku: 'SUB-ENT', categoryId: subs.id, type: 'subscription', unitPrice: '2400', unitCost: '900', taxRate: '18', subscriptionPlanId: annualPlan.id },
      ])
      .returning()

  // Tier price overrides. The laptop's gold price is the one TESTING.md documents —
  // leave it alone; the rest are on the newer products.
  await db.insert(s.priceListItems).values([
    { productId: laptop.id, tier: 'gold', unitPrice: '950' },
    { productId: monitor.id, tier: 'gold', unitPrice: '400' },
    { productId: monitor.id, tier: 'silver', unitPrice: '425' },
    { productId: docking.id, tier: 'gold', unitPrice: '160' },
    { productId: training.id, tier: 'gold', unitPrice: '720' },
  ])

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

  // West Hub deliberately stocks NO laptops, so the documented Main 8 + East 2
  // split for a qty-10 laptop line is unchanged by its existence.
  const [main, east, west] = await db
    .insert(s.warehouses)
    .values([
      { name: 'Main Warehouse', shippingCostWeight: '1' },
      { name: 'East Depot', shippingCostWeight: '1.5' },
      { name: 'West Hub', shippingCostWeight: '2' },
    ])
    .returning()

  await db.insert(s.stock).values([
    { warehouseId: main.id, productId: laptop.id, quantity: 8, reorderLevel: 3 },
    { warehouseId: east.id, productId: laptop.id, quantity: 5, reorderLevel: 2 },
    { warehouseId: main.id, productId: mouse.id, quantity: 50, reorderLevel: 10 },
    { warehouseId: east.id, productId: mouse.id, quantity: 20, reorderLevel: 5 },
    { warehouseId: main.id, productId: docking.id, quantity: 65, reorderLevel: 15 },
    { warehouseId: east.id, productId: docking.id, quantity: 12, reorderLevel: 10 },
    { warehouseId: west.id, productId: docking.id, quantity: 20, reorderLevel: 5 },
    // deliberately short: the backorder / delivery-slippage demo runs on this one
    { warehouseId: main.id, productId: monitor.id, quantity: 3, reorderLevel: 4 },
    { warehouseId: east.id, productId: monitor.id, quantity: 2, reorderLevel: 4 },
  ])

  const [, laptop32] = await db
    .insert(s.productVariants)
    .values([
      { productId: laptop.id, attribute: 'RAM', value: '16GB', extraPrice: '0', sku: 'HW-LAPTOP-16' },
      { productId: laptop.id, attribute: 'RAM', value: '32GB', extraPrice: '250', sku: 'HW-LAPTOP-32' },
      { productId: mouse.id, attribute: 'Pack', value: 'Single', extraPrice: '0' },
      { productId: mouse.id, attribute: 'Pack', value: 'Pack of 5', extraPrice: '80' },
      { productId: monitor.id, attribute: 'Size', value: '27 inch', extraPrice: '0' },
      { productId: monitor.id, attribute: 'Size', value: '32 inch', extraPrice: '120' },
      { productId: docking.id, attribute: 'Ports', value: '7-port', extraPrice: '0' },
      { productId: docking.id, attribute: 'Ports', value: '11-port', extraPrice: '45' },
    ])
    .returning()

  await db.insert(s.productPairings).values([
    { productId: laptop.id, suggestedProductId: mouse.id, score: 10 },
    { productId: laptop.id, suggestedProductId: docking.id, score: 9 },
    { productId: laptop.id, suggestedProductId: warranty.id, score: 8 },
    { productId: laptop.id, suggestedProductId: support.id, score: 5 },
    { productId: monitor.id, suggestedProductId: docking.id, score: 7 },
    { productId: docking.id, suggestedProductId: mouse.id, score: 4 },
    { productId: training.id, suggestedProductId: premiumSla.id, score: 6 },
    { productId: training.id, suggestedProductId: carePlan.id, score: 3 },
  ])

  /* ------------------------------------------------------------------ */
  /* Demo pipeline                                                       */
  /* ------------------------------------------------------------------ */

  const TIER_CEILING: Record<string, number> = { bronze: 5, silver: 10, gold: 15 }
  const CATEGORY_CEILING = new Map([
    [hardware.id, 15],
    [services.id, 10],
    [subs.id, 10],
  ])
  const priceOverrides = new Map(
    (await db.select().from(s.priceListItems)).map((p) => [`${p.productId}:${p.tier}`, Number(p.unitPrice)]),
  )

  type Product = typeof laptop
  type Customer = typeof acme
  type User = typeof riya
  interface DemoLine {
    product: Product
    qty?: number
    disc?: number
    variantId?: string
    variantExtra?: number
    /** came from the upsell panel — drives "Top upsold product" in Reports */
    viaUpsell?: boolean
  }

  /**
   * Build a quotation with its lines, score it with the real risk engine, and
   * write the audit entries a rep would have generated getting it to `status`.
   */
  async function makeQuote(opts: {
    customer: Customer
    rep: User
    lines: DemoLine[]
    status: (typeof s.quoteStatusEnum.enumValues)[number]
    orderDiscountPct?: number
    createdDaysAgo: number
    /** defaults to createdDaysAgo — set older to make the deal look stalled */
    activityDaysAgo?: number
    portalToken?: string
  }) {
    const createdAt = daysAgo(opts.createdDaysAgo)
    const orderDiscount = opts.orderDiscountPct ?? 0

    const [q] = await db
      .insert(s.quotations)
      .values({
        customerId: opts.customer.id,
        repId: opts.rep.id,
        status: opts.status,
        orderDiscountPct: money(orderDiscount),
        portalToken: opts.portalToken ?? null,
        createdAt,
        updatedAt: createdAt,
        lastActivityAt: daysAgo(opts.activityDaysAgo ?? opts.createdDaysAgo),
      })
      .returning()

    const inserted: { id: string; product: Product; qty: number; disc: number; unitPrice: number }[] = []
    for (const l of opts.lines) {
      const qty = l.qty ?? 1
      const disc = l.disc ?? 0
      const base = priceOverrides.get(`${l.product.id}:${opts.customer.tier}`) ?? Number(l.product.unitPrice)
      const unitPrice = base + (l.variantExtra ?? 0)
      const [row] = await db
        .insert(s.quoteLines)
        .values({
          quotationId: q.id,
          productId: l.product.id,
          variantId: l.variantId ?? null,
          quantity: qty,
          unitPrice: money(unitPrice),
          unitCost: l.product.unitCost,
          discountPct: money(disc),
          lineType: l.product.type,
          subscriptionPlanId: l.product.subscriptionPlanId,
        })
        .returning()
      inserted.push({ id: row.id, product: l.product, qty, disc, unitPrice })

      await db.insert(s.auditLog).values({
        quotationId: q.id,
        userId: opts.rep.id,
        action: 'line_added',
        detail: { product: l.product.name, quantity: qty, unitPrice, viaUpsell: l.viaUpsell ?? false },
        createdAt: plusHours(createdAt, 0.2),
      })
    }

    // score with the same pure function the API uses
    const risk = computeBlendedRisk(
      inserted.map((l) => ({
        discountPct: l.disc + orderDiscount,
        ceiling: Math.min(
          TIER_CEILING[opts.customer.tier],
          CATEGORY_CEILING.get(l.product.categoryId) ?? 100,
        ),
      })),
      { managerThreshold: 5, financeThreshold: 12 },
    )

    await db
      .update(s.quotations)
      .set({
        riskScore: money(risk.score),
        requiresManager: risk.requiresManager,
        requiresFinance: risk.requiresFinance,
      })
      .where(sql`${s.quotations.id} = ${q.id}`)

    return { quote: q, lines: inserted, risk, createdAt }
  }

  const submitted = async (quoteId: string, rep: User, at: Date, risk: ReturnType<typeof computeBlendedRisk>) =>
    db.insert(s.auditLog).values({
      quotationId: quoteId,
      userId: rep.id,
      action: 'submitted',
      detail: { score: risk.score, level: risk.level, breaches: risk.breaches },
      createdAt: at,
    })

  /** an approval step plus its matching audit entry, so approval-time reporting works */
  const decide = async (
    quoteId: string,
    step: 'manager' | 'finance',
    action: 'approve' | 'reject' | 'return' | null,
    approver: User | null,
    at: Date,
    reason?: string,
  ) => {
    await db.insert(s.approvals).values({
      quotationId: quoteId,
      step,
      action,
      approverId: action ? approver!.id : null,
      reason: reason ?? null,
      createdAt: at,
    })
    if (action)
      await db.insert(s.auditLog).values({
        quotationId: quoteId,
        userId: approver!.id,
        action: `${action}:${step}`,
        reason: reason ?? null,
        createdAt: at,
      })
  }

  const portalTokenFor = () => crypto.randomBytes(24).toString('hex')
  const negotiationToken = portalTokenFor()
  const sentToken = portalTokenFor()

  /* --- 1. draft, everything inside its limits --------------------------- */
  await makeQuote({
    customer: nova,
    rep: riya,
    lines: [
      { product: laptop, qty: 2, disc: 10 },
      { product: mouse, qty: 2, disc: 0, viaUpsell: true },
    ],
    status: 'draft',
    createdDaysAgo: 1,
  })

  /* --- 2. draft, over a ceiling but UNDER the approval threshold --------
     Shows the distinction the blended model is built on: the line is flagged
     OVER (+2pt) while the quote still needs nobody's signature.            */
  await makeQuote({
    customer: zenith,
    rep: dev,
    lines: [{ product: docking, qty: 4, disc: 12 }],
    status: 'draft',
    createdDaysAgo: 2,
  })

  /* --- 3. pending manager approval (the brief's own example) ------------ */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: acme,
      rep: riya,
      lines: [
        { product: laptop, qty: 1, disc: 12 },
        { product: setup, qty: 1, disc: 18 },
      ],
      status: 'pending_approval',
      createdDaysAgo: 3,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', null, null, plusHours(createdAt, 1))
  }

  /* --- 4. manager approved, now waiting on finance ---------------------- */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: orion,
      rep: sana,
      lines: [
        { product: setup, qty: 2, disc: 18 },
        { product: support, qty: 1, disc: 16 },
      ],
      status: 'pending_approval',
      createdDaysAgo: 4,
    })
    await submitted(quote.id, sana, plusHours(createdAt, 2), risk)
    await decide(quote.id, 'manager', 'approve', manoj, plusHours(createdAt, 6), 'Strategic account, margin still healthy')
    await decide(quote.id, 'finance', null, null, plusHours(createdAt, 2))
  }

  /* --- 5. returned for revision (back in the rep's hands) --------------- */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: beta,
      rep: riya,
      lines: [{ product: laptop, qty: 1, disc: 16, variantId: laptop32.id, variantExtra: 250 }],
      status: 'draft',
      createdDaysAgo: 6,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', 'return', manoj, plusHours(createdAt, 20), 'Please justify the 16% on hardware')
  }

  /* --- 6. rejected ------------------------------------------------------ */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: delta,
      rep: dev,
      lines: [{ product: laptop, qty: 1, disc: 11 }],
      status: 'rejected',
      createdDaysAgo: 8,
    })
    await submitted(quote.id, dev, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', 'reject', manoj, plusHours(createdAt, 5), 'Bronze tier cannot go past 5%')
  }

  /* --- 7. auto-approved, no approval step ever created ------------------ */
  await makeQuote({
    customer: gamma,
    rep: sana,
    lines: [{ product: mouse, qty: 10, disc: 4 }],
    status: 'approved',
    createdDaysAgo: 5,
  })

  /* --- 8. approved by a manager ----------------------------------------- */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: nova,
      rep: riya,
      lines: [
        { product: setup, qty: 1, disc: 16 },
        { product: warranty, qty: 2, disc: 5, viaUpsell: true },
      ],
      status: 'approved',
      createdDaysAgo: 7,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', 'approve', manoj, plusHours(createdAt, 4))
  }

  /* --- 9. sent to the customer, awaiting their response ------------------ */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: zenith,
      rep: sana,
      lines: [
        { product: laptop, qty: 3, disc: 8 },
        { product: docking, qty: 3, disc: 8, viaUpsell: true },
      ],
      status: 'sent',
      createdDaysAgo: 4,
      portalToken: sentToken,
    })
    await submitted(quote.id, sana, plusHours(createdAt, 1), risk)
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      userId: sana.id,
      action: 'sent_to_customer',
      detail: { emailed: true, to: zenith.email },
      createdAt: plusHours(createdAt, 2),
    })
  }

  /* --- 10. under negotiation: comment, counter-offer and a delivery date -- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: acme,
      rep: riya,
      lines: [
        { product: laptop, qty: 4, disc: 10 },
        { product: warranty, qty: 4, disc: 8, viaUpsell: true },
      ],
      status: 'under_negotiation',
      createdDaysAgo: 3,
      portalToken: negotiationToken,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await db.insert(s.negotiationRequests).values([
      {
        quotationId: quote.id,
        quoteLineId: lines[1].id,
        type: 'comment',
        message: 'Can the warranty be 15% off instead of 8%?',
        createdAt: plusHours(createdAt, 26),
      },
      {
        quotationId: quote.id,
        type: 'counter_discount',
        message: 'We can sign today at 14% on the order.',
        counterDiscountPct: '14',
        createdAt: plusHours(createdAt, 27),
      },
      {
        quotationId: quote.id,
        type: 'change_request',
        message: 'Need these on site before the quarter closes.',
        requestedDeliveryDate: new Date(Date.now() + 21 * DAY),
        createdAt: plusHours(createdAt, 28),
      },
    ])
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      action: 'customer_counter_discount',
      detail: { counterDiscountPct: 14 },
      createdAt: plusHours(createdAt, 27),
    })
  }

  /* --- 11. confirmed by the customer, ready to fulfil -------------------- */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: nova,
      rep: riya,
      lines: [
        { product: laptop, qty: 2, disc: 12 },
        { product: mouse, qty: 4, disc: 5, viaUpsell: true },
      ],
      status: 'confirmed',
      createdDaysAgo: 9,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      action: 'customer_confirmed',
      detail: { score: risk.score, level: risk.level },
      createdAt: plusHours(createdAt, 30),
    })
  }

  /* --- 12. fulfilled cleanly, split across two warehouses ---------------- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: orion,
      rep: sana,
      lines: [{ product: docking, qty: 70, disc: 6 }],
      status: 'fulfilled',
      createdDaysAgo: 12,
    })
    await submitted(quote.id, sana, plusHours(createdAt, 1), risk)
    // 70 units: Main is cheapest but only holds 65, so it spills into West Hub
    await db.insert(s.fulfillmentAllocations).values([
      { quotationId: quote.id, quoteLineId: lines[0].id, warehouseId: main.id, quantity: 55, createdAt: plusHours(createdAt, 26) },
      { quotationId: quote.id, quoteLineId: lines[0].id, warehouseId: west.id, quantity: 15, createdAt: plusHours(createdAt, 26) },
    ])
    await db
      .update(s.stock)
      .set({ quantity: sql`${s.stock.quantity} - 55` })
      .where(sql`${s.stock.warehouseId} = ${main.id} AND ${s.stock.productId} = ${docking.id}`)
    await db
      .update(s.stock)
      .set({ quantity: sql`${s.stock.quantity} - 15` })
      .where(sql`${s.stock.warehouseId} = ${west.id} AND ${s.stock.productId} = ${docking.id}`)
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      userId: farah.id,
      action: 'fulfillment_accepted',
      createdAt: plusHours(createdAt, 26),
    })
  }

  /* --- 13. fulfilled with an open backorder -> delivery slippage --------- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: delta,
      rep: dev,
      lines: [{ product: monitor, qty: 12, disc: 4 }],
      status: 'fulfilled',
      createdDaysAgo: 10,
    })
    await submitted(quote.id, dev, plusHours(createdAt, 1), risk)
    // only 5 units exist across both depots; the other 7 go on backorder
    await db.insert(s.fulfillmentAllocations).values([
      { quotationId: quote.id, quoteLineId: lines[0].id, warehouseId: main.id, quantity: 3, createdAt: plusHours(createdAt, 20) },
      { quotationId: quote.id, quoteLineId: lines[0].id, warehouseId: east.id, quantity: 2, createdAt: plusHours(createdAt, 20) },
      { quotationId: quote.id, quoteLineId: lines[0].id, warehouseId: null, quantity: 7, backordered: true, createdAt: plusHours(createdAt, 20) },
    ])
    await db
      .update(s.stock)
      .set({ quantity: 0 })
      .where(sql`${s.stock.productId} = ${monitor.id}`)
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      userId: farah.id,
      action: 'fulfillment_accepted',
      detail: { backordered: 7 },
      createdAt: plusHours(createdAt, 20),
    })
  }

  /* --- 14. invoiced and paid in full ------------------------------------ */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: acme,
      rep: riya,
      lines: [
        { product: laptop, qty: 1, disc: 5 },
        { product: setup, qty: 1, disc: 5 },
      ],
      status: 'invoiced',
      createdDaysAgo: 20,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    const total = lines.reduce(
      (sum, l) => sum + computeLine({ quantity: l.qty, unitPrice: l.unitPrice, unitCost: l.product.unitCost, discountPct: l.disc }).net,
      0,
    )
    const [inv] = await db
      .insert(s.invoices)
      .values({
        quotationId: quote.id,
        type: 'onetime',
        status: 'paid',
        amount: money(total),
        issuedAt: daysAgo(18),
        dueAt: daysAgo(4),
        paidAt: daysAgo(6),
      })
      .returning()
    await db.insert(s.payments).values({ invoiceId: inv.id, amount: money(total), method: 'bank transfer', paidAt: daysAgo(6) })
    await db.insert(s.auditLog).values({ quotationId: quote.id, userId: farah.id, action: 'payment_recorded', detail: { amount: total, settled: true }, createdAt: daysAgo(6) })
  }

  /* --- 15. invoiced and OVERDUE ----------------------------------------- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: beta,
      rep: dev,
      lines: [{ product: laptop, qty: 2, disc: 6 }],
      status: 'invoiced',
      createdDaysAgo: 30,
      activityDaysAgo: 30,
    })
    await submitted(quote.id, dev, plusHours(createdAt, 1), risk)
    const total = computeLine({ quantity: 2, unitPrice: lines[0].unitPrice, unitCost: laptop.unitCost, discountPct: 6 }).net
    await db.insert(s.invoices).values({
      quotationId: quote.id,
      type: 'onetime',
      status: 'sent',
      amount: money(total),
      issuedAt: daysAgo(28),
      dueAt: daysAgo(14), // two weeks past due
    })
  }

  /* --- 16. invoiced, PARTIALLY paid -------------------------------------
     Proves a part-payment leaves the invoice open instead of settling it.  */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: zenith,
      rep: sana,
      lines: [{ product: training, qty: 1, disc: 0 }],
      status: 'invoiced',
      createdDaysAgo: 15,
    })
    await submitted(quote.id, sana, plusHours(createdAt, 1), risk)
    const total = computeLine({ quantity: 1, unitPrice: lines[0].unitPrice, unitCost: training.unitCost, discountPct: 0 }).net
    const [inv] = await db
      .insert(s.invoices)
      .values({ quotationId: quote.id, type: 'onetime', status: 'sent', amount: money(total), issuedAt: daysAgo(13), dueAt: new Date(Date.now() + 3 * DAY) })
      .returning()
    await db.insert(s.payments).values({ invoiceId: inv.id, amount: '200', method: 'manual', paidAt: daysAgo(5) })
  }

  /* --- 17. hybrid order: one-time invoice + a live monthly subscription -- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: nova,
      rep: riya,
      lines: [
        { product: laptop, qty: 1, disc: 8 },
        { product: carePlan, qty: 3, disc: 0, viaUpsell: true },
      ],
      status: 'invoiced',
      createdDaysAgo: 11,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    const oneTime = computeLine({ quantity: 1, unitPrice: lines[0].unitPrice, unitCost: laptop.unitCost, discountPct: 8 }).net
    await db.insert(s.invoices).values({ quotationId: quote.id, type: 'onetime', status: 'sent', amount: money(oneTime), issuedAt: daysAgo(9), dueAt: new Date(Date.now() + 5 * DAY) })
    const recurring = computeLine({ quantity: 3, unitPrice: lines[1].unitPrice, unitCost: carePlan.unitCost, discountPct: 0 }).net
    await db.insert(s.billingSchedules).values({
      quotationId: quote.id,
      quoteLineId: lines[1].id,
      subscriptionPlanId: monthlyPlan.id,
      nextBillingDate: nextBillingDate(daysAgo(9), 'monthly' as Interval),
      amount: money(recurring),
      status: 'scheduled',
    })
  }

  /* --- 18. a PAUSED quarterly subscription ------------------------------ */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: orion,
      rep: sana,
      lines: [{ product: premiumSla, qty: 1, disc: 5 }],
      status: 'invoiced',
      createdDaysAgo: 40,
    })
    await submitted(quote.id, sana, plusHours(createdAt, 1), risk)
    const amount = computeLine({ quantity: 1, unitPrice: lines[0].unitPrice, unitCost: premiumSla.unitCost, discountPct: 5 }).net
    await db.insert(s.billingSchedules).values({
      quotationId: quote.id,
      quoteLineId: lines[0].id,
      subscriptionPlanId: quarterlyPlan.id,
      nextBillingDate: nextBillingDate(daysAgo(38), 'quarterly' as Interval),
      amount: money(amount),
      status: 'paused',
    })
    await db.insert(s.auditLog).values({ quotationId: quote.id, userId: farah.id, action: 'subscription_paused', createdAt: daysAgo(6) })
  }

  /* --- 19. a CANCELLED subscription with its refund credit note ---------- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: delta,
      rep: dev,
      lines: [{ product: support, qty: 2, disc: 0 }],
      status: 'invoiced',
      createdDaysAgo: 50,
    })
    await submitted(quote.id, dev, plusHours(createdAt, 1), risk)
    const amount = computeLine({ quantity: 2, unitPrice: lines[0].unitPrice, unitCost: support.unitCost, discountPct: 0 }).net
    await db.insert(s.billingSchedules).values({
      quotationId: quote.id,
      quoteLineId: lines[0].id,
      subscriptionPlanId: monthlyPlan.id,
      nextBillingDate: nextBillingDate(daysAgo(20), 'monthly' as Interval),
      amount: money(amount),
      status: 'cancelled',
    })
    // Monthly Support refunds 50% of the unused remainder
    await db.insert(s.creditNotes).values({
      quotationId: quote.id,
      amount: '25.00',
      reason: 'Subscription cancelled (prorated refund)',
      createdAt: daysAgo(8),
    })
    await db.insert(s.auditLog).values({ quotationId: quote.id, userId: farah.id, action: 'subscription_cancelled', detail: { refund: 25 }, createdAt: daysAgo(8) })
  }

  /* --- 20. an annual plan, so yearly billing shows up ------------------- */
  {
    const { quote, lines, risk, createdAt } = await makeQuote({
      customer: acme,
      rep: riya,
      lines: [{ product: enterprise, qty: 1, disc: 8 }],
      status: 'invoiced',
      createdDaysAgo: 25,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    const amount = computeLine({ quantity: 1, unitPrice: lines[0].unitPrice, unitCost: enterprise.unitCost, discountPct: 8 }).net
    await db.insert(s.billingSchedules).values({
      quotationId: quote.id,
      quoteLineId: lines[0].id,
      subscriptionPlanId: annualPlan.id,
      nextBillingDate: nextBillingDate(daysAgo(23), 'yearly' as Interval),
      amount: money(amount),
      status: 'scheduled',
    })
  }

  /* --- 21-23. STALLED deals: active but untouched for well over 7 days --- */
  await makeQuote({
    customer: zenith,
    rep: dev,
    lines: [{ product: monitor, qty: 6, disc: 5 }],
    status: 'draft',
    createdDaysAgo: 26,
    activityDaysAgo: 19,
  })
  await makeQuote({
    customer: gamma,
    rep: sana,
    lines: [{ product: docking, qty: 2, disc: 3 }],
    status: 'sent',
    createdDaysAgo: 24,
    activityDaysAgo: 15,
    portalToken: portalTokenFor(),
  })
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: beta,
      rep: riya,
      lines: [{ product: training, qty: 1, disc: 14 }],
      status: 'pending_approval',
      createdDaysAgo: 22,
      activityDaysAgo: 11,
    })
    await submitted(quote.id, riya, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', null, null, plusHours(createdAt, 1))
  }

  /* --- 24. the DISCOUNT ANOMALY -----------------------------------------
     Dev's other deals score 0-2. This one is far above that baseline, which
     is exactly what findDiscountAnomalies looks for: a spike against the
     rep's OWN history, not a fixed threshold.                              */
  {
    const { quote, risk, createdAt } = await makeQuote({
      customer: delta,
      rep: dev,
      lines: [
        { product: laptop, qty: 5, disc: 22 },
        { product: setup, qty: 2, disc: 20 },
      ],
      status: 'pending_approval',
      createdDaysAgo: 2,
    })
    await submitted(quote.id, dev, plusHours(createdAt, 1), risk)
    await decide(quote.id, 'manager', null, null, plusHours(createdAt, 1))
    await decide(quote.id, 'finance', null, null, plusHours(createdAt, 1))
  }

  /* --- 25. cancelled deal ------------------------------------------------ */
  {
    const { quote, createdAt } = await makeQuote({
      customer: gamma,
      rep: sana,
      lines: [{ product: laptop, qty: 1, disc: 3 }],
      status: 'cancelled',
      createdDaysAgo: 17,
    })
    await db.insert(s.auditLog).values({
      quotationId: quote.id,
      userId: sana.id,
      action: 'cancelled',
      reason: 'Customer went with an incumbent supplier',
      createdAt: plusHours(createdAt, 48),
    })
  }

  /* ------------------------------------------------------------------ */

  const [{ count: quoteCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.quotations)
  const allQuotes = await db.select().from(s.quotations)
  const byStatus = allQuotes.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1
    return acc
  }, {})

  console.log('✔ seed complete')
  console.log(`  ${quoteCount} quotations:`, byStatus)
  console.log('  logins: rep@ / dev@ / sana@ / manager@ / finance@ / admin@dealflow.com — password123')
  console.log('  customer portal links (no login needed):')
  const first = allQuotes.find((q) => q.portalToken === negotiationToken)
  const second = allQuotes.find((q) => q.portalToken === sentToken)
  if (second) console.log(`    awaiting response : http://localhost:5173/portal/${sentToken}  (${quoteNumber(second.seqNo, second.createdAt)})`)
  if (first) console.log(`    under negotiation : http://localhost:5173/portal/${negotiationToken}  (${quoteNumber(first.seqNo, first.createdAt)})`)
}

seed()
  .catch((e) => {
    console.error('seed failed:', e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
