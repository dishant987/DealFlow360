import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// money helper — always NUMERIC, never float
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })
// uuid primary key helper
const pk = () => uuid('id').primaryKey().defaultRandom()

/* ---------- enums ---------- */
export const roleEnum = pgEnum('role', ['rep', 'manager', 'finance', 'admin'])
export const tierEnum = pgEnum('customer_tier', ['bronze', 'silver', 'gold'])
export const productTypeEnum = pgEnum('product_type', ['onetime', 'subscription'])
export const planIntervalEnum = pgEnum('plan_interval', ['monthly', 'quarterly', 'yearly'])
export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'sent',
  'under_negotiation',
  'confirmed',
  'fulfilled',
  'invoiced',
  'cancelled',
])
export const approvalStepEnum = pgEnum('approval_step', ['manager', 'finance'])
export const approvalActionEnum = pgEnum('approval_action', ['approve', 'reject', 'return'])
export const invoiceTypeEnum = pgEnum('invoice_type', ['onetime', 'recurring'])
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'void'])
export const billingStatusEnum = pgEnum('billing_status', ['scheduled', 'billed', 'cancelled'])
export const negotiationTypeEnum = pgEnum('negotiation_type', [
  'comment',
  'change_request',
  'counter_discount',
])
export const negotiationStatusEnum = pgEnum('negotiation_status', ['open', 'addressed'])

/* ---------- users & customers ---------- */
export const users = pgTable('users', {
  id: pk(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('rep'),
  resetTokenHash: text('reset_token_hash'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const customers = pgTable('customers', {
  id: pk(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  tier: tierEnum('tier').notNull().default('bronze'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/* ---------- catalog ---------- */
export const categories = pgTable('categories', {
  id: pk(),
  name: text('name').notNull().unique(),
})

export const products = pgTable('products', {
  id: pk(),
  name: text('name').notNull(),
  sku: text('sku').notNull().unique(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  type: productTypeEnum('type').notNull().default('onetime'),
  unitPrice: money('unit_price').notNull(),
  unitCost: money('unit_cost').notNull(), // for margin math
  unit: text('unit').notNull().default('unit'),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  description: text('description'),
  subscriptionPlanId: uuid('subscription_plan_id'), // set for type=subscription
  isPromoted: boolean('is_promoted').notNull().default(false),
  active: boolean('active').notNull().default(true),
})

// tier-based price overrides (falls back to products.unit_price when absent)
export const priceListItems = pgTable(
  'price_list_items',
  {
    id: pk(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    tier: tierEnum('tier').notNull(),
    unitPrice: money('unit_price').notNull(),
  },
  (t) => [uniqueIndex('price_list_product_tier_uq').on(t.productId, t.tier)],
)

/* ---------- discount governance ---------- */
export const discountTiers = pgTable('discount_tiers', {
  id: pk(),
  tier: tierEnum('tier').notNull().unique(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
})

export const categoryDiscountCeilings = pgTable('category_discount_ceilings', {
  id: pk(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id)
    .unique(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
})

/* ---------- warehouses & stock ---------- */
export const warehouses = pgTable('warehouses', {
  id: pk(),
  name: text('name').notNull().unique(),
  shippingCostWeight: numeric('shipping_cost_weight', { precision: 6, scale: 2 })
    .notNull()
    .default('1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const stock = pgTable(
  'stock',
  {
    id: pk(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull().default(0),
    reorderLevel: integer('reorder_level').notNull().default(0),
  },
  (t) => [uniqueIndex('stock_wh_product_uq').on(t.warehouseId, t.productId)],
)

/* ---------- subscriptions ---------- */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: pk(),
  name: text('name').notNull(),
  interval: planIntervalEnum('interval').notNull().default('monthly'),
  prorationEnabled: boolean('proration_enabled').notNull().default(true),
  cancellationRefundPct: numeric('cancellation_refund_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('0'),
})

/* ---------- upsell / cross-sell ---------- */
export const productPairings = pgTable(
  'product_pairings',
  {
    id: pk(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    suggestedProductId: uuid('suggested_product_id')
      .notNull()
      .references(() => products.id),
    score: integer('score').notNull().default(0), // co-purchase rank
  },
  (t) => [uniqueIndex('pairing_uq').on(t.productId, t.suggestedProductId)],
)

/* ---------- tunable knobs (singleton row) ---------- */
export const appSettings = pgTable('app_settings', {
  id: pk(),
  managerThreshold: numeric('manager_threshold', { precision: 6, scale: 2 })
    .notNull()
    .default('5'), // blended risk score above this → manager approval
  financeThreshold: numeric('finance_threshold', { precision: 6, scale: 2 })
    .notNull()
    .default('12'), // above this → also finance approval
  minUpsellMarginPct: numeric('min_upsell_margin_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('20'),
  stalledDays: integer('stalled_days').notNull().default(7),
})

/* ---------- quotations ---------- */
export const quotations = pgTable('quotations', {
  id: pk(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  repId: uuid('rep_id')
    .notNull()
    .references(() => users.id),
  status: quoteStatusEnum('status').notNull().default('draft'),
  riskScore: numeric('risk_score', { precision: 6, scale: 2 }).notNull().default('0'),
  requiresManager: boolean('requires_manager').notNull().default(false),
  requiresFinance: boolean('requires_finance').notNull().default(false),
  orderDiscountPct: numeric('order_discount_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('0'),
  portalToken: text('portal_token').unique(), // magic-link token for customer portal
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(), // stalled-deal detection
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const quoteLines = pgTable('quote_lines', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  description: text('description'),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: money('unit_price').notNull(), // snapshot
  unitCost: money('unit_cost').notNull(), // snapshot
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  lineType: productTypeEnum('line_type').notNull().default('onetime'),
  subscriptionPlanId: uuid('subscription_plan_id').references(() => subscriptionPlans.id),
})

/* ---------- approvals & audit ---------- */
export const approvals = pgTable('approvals', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  step: approvalStepEnum('step').notNull(),
  approverId: uuid('approver_id').references(() => users.id),
  action: approvalActionEnum('action'), // null = pending
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// immutable trail for every approval/rejection/edit (A3)
export const auditLog = pgTable('audit_log', {
  id: pk(),
  quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  detail: jsonb('detail'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/* ---------- fulfillment (allocations hang directly off the quote) ---------- */
export const fulfillmentAllocations = pgTable('fulfillment_allocations', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id')
    .notNull()
    .references(() => quoteLines.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  quantity: integer('quantity').notNull(),
  backordered: boolean('backordered').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/* ---------- billing & invoices ---------- */
export const invoices = pgTable('invoices', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  type: invoiceTypeEnum('type').notNull().default('onetime'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  amount: money('amount').notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  dueAt: timestamp('due_at'),
  paidAt: timestamp('paid_at'),
})

export const billingSchedules = pgTable('billing_schedules', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id')
    .notNull()
    .references(() => quoteLines.id, { onDelete: 'cascade' }),
  subscriptionPlanId: uuid('subscription_plan_id')
    .notNull()
    .references(() => subscriptionPlans.id),
  nextBillingDate: timestamp('next_billing_date').notNull(),
  amount: money('amount').notNull(),
  status: billingStatusEnum('status').notNull().default('scheduled'),
})

export const payments = pgTable('payments', {
  id: pk(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  amount: money('amount').notNull(),
  method: text('method').notNull().default('manual'),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
})

export const creditNotes = pgTable('credit_notes', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  amount: money('amount').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/* ---------- customer portal negotiation ---------- */
export const negotiationRequests = pgTable('negotiation_requests', {
  id: pk(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id').references(() => quoteLines.id, { onDelete: 'cascade' }),
  type: negotiationTypeEnum('type').notNull(),
  message: text('message'),
  counterDiscountPct: numeric('counter_discount_pct', { precision: 5, scale: 2 }),
  status: negotiationStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
