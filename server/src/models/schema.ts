import { sql } from 'drizzle-orm'
import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  serial,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// money helper — always NUMERIC, never float
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })
// uuid primary key helper
const pk = () => uuid('id').primaryKey().defaultRandom()

/* ---------- companies (multi-tenancy) ----------
   Every business table carries organization_id. It defaults to the request's
   company (set per request in config/tenant.ts) and Postgres row-level security
   (migration 0006) only ever shows rows of that company. */
export const organizations = pgTable('organizations', {
  id: pk(),
  name: text('name').notNull(),
  // ISO 4217 code every amount is shown in; chosen at sign-up, editable in Settings
  currency: text('currency').notNull().default('USD'),
  // Dealwise's own subscription (step 17): 'trial' until an admin pays for 'starter' or 'growth'.
  // Rules in services/plan.ts; Stripe is the source of truth for status once subscribed.
  plan: text('plan').notNull().default('trial'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }).notNull().default(sql`now() + interval '14 days'`),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
// Migration 0006 also adds an index on every organization_id and the RLS policies;
// drizzle-kit doesn't model those, so never run `db:push` (it would drop them).
const tenantId = () =>
  uuid('organization_id')
    .notNull()
    .default(sql`(current_setting('app.org_id'))::uuid`)
    .references(() => organizations.id)

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
export const billingStatusEnum = pgEnum('billing_status', [
  'scheduled',
  'billed',
  // paused: billing is suspended but the plan is not torn down — resuming rolls the
  // next billing date forward rather than back-billing the gap
  'paused',
  'cancelled',
])
export const negotiationTypeEnum = pgEnum('negotiation_type', [
  'comment',
  'change_request',
  'counter_discount',
])
export const negotiationStatusEnum = pgEnum('negotiation_status', ['open', 'addressed'])

/* ---------- users & customers ---------- */
export const users = pgTable('users', {
  id: pk(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('rep'),
  // blocked users can't sign in and their open sessions stop working at once
  blocked: boolean('blocked').notNull().default(false),
  // MFA: TOTP secret is AES-GCM encrypted (utils/totp.ts); set during setup, live once mfaEnabled
  mfaSecret: text('mfa_secret'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  // sha256 of each unused recovery code; a code is removed when used
  mfaRecoveryHashes: text('mfa_recovery_hashes').array().notNull().default(sql`'{}'::text[]`),
  resetTokenHash: text('reset_token_hash'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
  // null until the address is proven (verify link, invite link or Google)
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // set when an admin invites by email; cleared once they set their password
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// One row per sign-in (device). Like `users`, NOT under RLS: it is read on every
// request before the company is known. Always query it by user id.
export const sessions = pgTable('sessions', {
  id: pk(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('sessions_user_id_idx').on(t.userId)])

export const customers = pgTable('customers', {
  id: pk(),
  organizationId: tenantId(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  tier: tierEnum('tier').notNull().default('bronze'),
  phone: text('phone'),
  website: text('website'),
  billingAddress: text('billing_address'),
  shippingAddress: text('shipping_address'),
  taxId: text('tax_id'), // GST / VAT number
  paymentTermsDays: integer('payment_terms_days').notNull().default(30), // Net 30
  notes: text('notes'),
  // the rep who owns the account: reps may edit only their own customers.
  // users aren't under RLS, so the API checks the owner is in the same company.
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** People at a customer; the primary contact receives quote links. */
export const contacts = pgTable('contacts', {
  id: pk(),
  organizationId: tenantId(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  jobTitle: text('job_title'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ---------- catalog ---------- */
export const categories = pgTable('categories', {
  id: pk(),
  organizationId: tenantId(),
  name: text('name').notNull(),
}, (t) => [uniqueIndex('categories_org_name_uq').on(t.organizationId, t.name)])

export const products = pgTable('products', {
  id: pk(),
  organizationId: tenantId(),
  name: text('name').notNull(),
  sku: text('sku').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  type: productTypeEnum('type').notNull().default('onetime'),
  unitPrice: money('unit_price').notNull(),
  unitCost: money('unit_cost').notNull(), // for margin math
  unit: text('unit').notNull().default('unit'),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  description: text('description'),
  // set for type=subscription. subscriptionPlans is declared further down, so the
  // reference goes through a callback with an explicit return type.
  subscriptionPlanId: uuid('subscription_plan_id').references(
    (): AnyPgColumn => subscriptionPlans.id,
  ),
  isPromoted: boolean('is_promoted').notNull().default(false),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('products_org_sku_uq').on(t.organizationId, t.sku)])

// tier-based price overrides (falls back to products.unit_price when absent)
export const priceListItems = pgTable(
  'price_list_items',
  {
    id: pk(),
  organizationId: tenantId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    tier: tierEnum('tier').notNull(),
    unitPrice: money('unit_price').notNull(),
  },
  (t) => [uniqueIndex('price_list_product_tier_uq').on(t.productId, t.tier)],
)

// A2: variants — attribute (e.g. "Size"), value (e.g. "Large"), extra price on top of base
export const productVariants = pgTable('product_variants', {
  id: pk(),
  organizationId: tenantId(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  attribute: text('attribute').notNull(),
  value: text('value').notNull(),
  extraPrice: money('extra_price').notNull().default('0'),
  sku: text('sku'),
})

/* ---------- discount governance ---------- */
export const discountTiers = pgTable('discount_tiers', {
  id: pk(),
  organizationId: tenantId(),
  tier: tierEnum('tier').notNull(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
}, (t) => [uniqueIndex('discount_tiers_org_tier_uq').on(t.organizationId, t.tier)])

export const categoryDiscountCeilings = pgTable('category_discount_ceilings', {
  id: pk(),
  organizationId: tenantId(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id)
    .unique(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
})

/* ---------- warehouses & stock ---------- */
export const warehouses = pgTable('warehouses', {
  id: pk(),
  organizationId: tenantId(),
  name: text('name').notNull(),
  shippingCostWeight: numeric('shipping_cost_weight', { precision: 6, scale: 2 })
    .notNull()
    .default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('warehouses_org_name_uq').on(t.organizationId, t.name)])

export const stock = pgTable(
  'stock',
  {
    id: pk(),
  organizationId: tenantId(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull().default(0),
    // A4 replenishment rule, held per warehouse+product:
    //   reorderLevel = the point at which this location needs restocking
    //   targetLevel  = what a replenishment should bring it back up to
    // A target of 0 means "warn me but propose nothing" — the old behaviour.
    reorderLevel: integer('reorder_level').notNull().default(0),
    targetLevel: integer('target_level').notNull().default(0),
  },
  (t) => [uniqueIndex('stock_wh_product_uq').on(t.warehouseId, t.productId)],
)

/* ---------- subscriptions ---------- */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: pk(),
  organizationId: tenantId(),
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
  organizationId: tenantId(),
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
  organizationId: tenantId(),
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
  organizationId: tenantId(),
  // human-readable quotation number — sequence guarantees uniqueness under concurrency
  seqNo: serial('seq_no').notNull(),
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
  // links stop working after this; a missing value counts as expired (fail closed)
  portalTokenExpiresAt: timestamp('portal_token_expires_at', { withTimezone: true }),
  // quote details (step 12). validUntil: the customer can't confirm after it.
  validUntil: timestamp('valid_until', { withTimezone: true }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  customerPo: text('customer_po'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30), // copied from the customer; sets invoice due dates
  notesToCustomer: text('notes_to_customer'),
  internalNotes: text('internal_notes'), // never sent to the portal
  terms: text('terms'), // terms & conditions shown to the customer
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(), // stalled-deal detection
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const quoteLines = pgTable('quote_lines', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
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
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  step: approvalStepEnum('step').notNull(),
  approverId: uuid('approver_id').references(() => users.id),
  action: approvalActionEnum('action'), // null = pending
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// immutable trail for every approval/rejection/edit (A3)
// Every version of a quote the customer was shown, frozen (step 26). `snapshot` is the
// customer-facing view (no cost); `hash` is its sha256, so a signature proves which
// exact terms were accepted. Signature fields are set when the customer signs it.
export const quoteVersions = pgTable(
  'quote_versions',
  {
    id: pk(),
    organizationId: tenantId(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    hash: text('hash').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    signedName: text('signed_name'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedIp: text('signed_ip'),
    signedUserAgent: text('signed_user_agent'),
  },
  (t) => [uniqueIndex('quote_versions_quote_version_uq').on(t.quotationId, t.version)],
)

export const auditLog = pgTable('audit_log', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  detail: jsonb('detail'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ---------- fulfillment (allocations hang directly off the quote) ---------- */
export const fulfillmentAllocations = pgTable('fulfillment_allocations', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id')
    .notNull()
    .references(() => quoteLines.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id), // null for backorder rows
  quantity: integer('quantity').notNull(),
  backordered: boolean('backordered').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ---------- billing & invoices ---------- */
export const invoices = pgTable('invoices', {
  id: pk(),
  organizationId: tenantId(),
  // invoices need their own document number, independent of the quote
  seqNo: serial('seq_no').notNull(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  type: invoiceTypeEnum('type').notNull().default('onetime'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  amount: money('amount').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
})

export const billingSchedules = pgTable('billing_schedules', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id')
    .notNull()
    .references(() => quoteLines.id, { onDelete: 'cascade' }),
  subscriptionPlanId: uuid('subscription_plan_id')
    .notNull()
    .references(() => subscriptionPlans.id),
  nextBillingDate: timestamp('next_billing_date', { withTimezone: true }).notNull(),
  amount: money('amount').notNull(),
  status: billingStatusEnum('status').notNull().default('scheduled'),
})

export const payments = pgTable('payments', {
  id: pk(),
  organizationId: tenantId(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  amount: money('amount').notNull(),
  method: text('method').notNull().default('manual'),
  paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
})

export const creditNotes = pgTable('credit_notes', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  amount: money('amount').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ---------- customer portal negotiation ---------- */
export const negotiationRequests = pgTable('negotiation_requests', {
  id: pk(),
  organizationId: tenantId(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  quoteLineId: uuid('quote_line_id').references(() => quoteLines.id, { onDelete: 'cascade' }),
  type: negotiationTypeEnum('type').notNull(),
  message: text('message'),
  counterDiscountPct: numeric('counter_discount_pct', { precision: 5, scale: 2 }),
  // customers can ask for a delivery date alongside a comment or counter-offer
  requestedDeliveryDate: timestamp('requested_delivery_date', { withTimezone: true }),
  status: negotiationStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
