import { Router } from 'express'
import { z } from 'zod'
import { db } from '../config/db.js'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { crud, num, tier } from '../utils/crud.js'
import { importRows, importTemplate } from '../controllers/import.controller.js'
import { customerAccess } from '../controllers/customer.controller.js'
import {
  categories,
  products,
  priceListItems,
  discountTiers,
  categoryDiscountCeilings,
  warehouses,
  subscriptionPlans,
  productPairings,
  productVariants,
  customers,
} from '../models/schema.js'
import {
  listStock,
  upsertStock,
  deleteStock,
  listPairings,
  listVariants,
  listCeilings,
  listProductsAdmin,
  productStockDetail,
  listAudit,
  getSettings,
  updateSettings,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/config.controller.js'

const router = Router()

router.use(requireAuth)

const adminOnly = requireRole('admin')
// brief: the Sales Manager configures discount tiers & approval chains
const managerConfig = requireRole('manager', 'admin')
// catalogue and warehouses: managers run them day to day, not only the admin
const catalogue = managerConfig

// bulk import: an onboarding job for managers and admins (reps add customers one at a time)
router.get('/import/:kind/template', managerConfig, importTemplate)
router.post('/import/:kind', managerConfig, importRows)

router.use('/categories', catalogue, crud(categories, z.object({ name: z.string().min(1) })))

// Reps add the customers they sell to. Tier sets the price list and discount
// ceilings, so a rep's customer always starts at bronze and only a manager or
// admin can move it; deleting a customer stays with the admin.
router.delete('/customers/:id', adminOnly)
router.use(
  '/customers',
  requireRole('rep', 'manager', 'admin'),
  customerAccess, // reps own what they create and edit only their own (customer.controller.ts)
  crud(
    customers,
    z.object({
      name: z.string().trim().min(1),
      email: z.string().trim().email(),
      tier: z.enum(['bronze', 'silver', 'gold']),
      phone: z.string().trim().max(40).nullable().optional(),
      website: z.string().trim().max(200).nullable().optional(),
      billingAddress: z.string().trim().max(500).nullable().optional(),
      shippingAddress: z.string().trim().max(500).nullable().optional(),
      taxId: z.string().trim().max(40).nullable().optional(),
      paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
      ownerId: z.string().uuid().nullable().optional(),
    }),
  ),
)

router.get('/products', catalogue, listProductsAdmin)
router.get('/products/:id/stock', catalogue, productStockDetail)
router.use(
  '/products',
  catalogue,
  crud(
    products,
    z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      categoryId: z.string().uuid(),
      type: z.enum(['onetime', 'subscription']).optional(),
      unitPrice: num,
      unitCost: num,
      unit: z.string().optional(),
      taxRate: num.optional(),
      description: z.string().optional(),
      subscriptionPlanId: z.string().uuid().optional(),
      isPromoted: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
  ),
)

router.use('/price-list', catalogue, crud(priceListItems, z.object({ productId: z.string().uuid(), tier, unitPrice: num })))

router.use('/warehouses', catalogue, crud(warehouses, z.object({ name: z.string().min(1), shippingCostWeight: num.optional() })))

router.use(
  '/subscription-plans',
  catalogue,
  crud(
    subscriptionPlans,
    z.object({
      name: z.string().min(1),
      interval: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
      prorationEnabled: z.boolean().optional(),
      cancellationRefundPct: num.optional(),
    }),
  ),
)

// joined GET registered first so the UI shows names; crud handles the writes
router.get('/pairings', catalogue, listPairings)
router.use(
  '/pairings',
  catalogue,
  crud(
    productPairings,
    z.object({
      productId: z.string().uuid(),
      suggestedProductId: z.string().uuid(),
      score: z.number().int().optional(),
    }),
  ),
)

/* ---- A2: product variants (attribute / value / extra price) ---- */
router.get('/variants', catalogue, listVariants)
router.use(
  '/variants',
  catalogue,
  crud(
    productVariants,
    z.object({
      productId: z.string().uuid(),
      attribute: z.string().min(1),
      value: z.string().min(1),
      extraPrice: num.optional(),
      sku: z.string().optional(),
    }),
  ),
)

router.get('/stock', catalogue, listStock)
router.post('/stock', catalogue, upsertStock)
router.delete('/stock/:id', catalogue, deleteStock)

router.use('/users', adminOnly, (() => {
  const r = Router()
  r.get('/', listUsers)
  r.post('/', createUser)
  r.patch('/:id', updateUser)
  r.delete('/:id', deleteUser)
  return r
})())

/* ---- discount governance & approval chain: Sales Manager (and admin) ---- */
router.use('/discount-tiers', managerConfig, crud(discountTiers, z.object({ tier, maxDiscountPct: num })))

router.get('/category-ceilings', managerConfig, listCeilings)
router.use(
  '/category-ceilings',
  managerConfig,
  crud(categoryDiscountCeilings, z.object({ categoryId: z.string().uuid(), maxDiscountPct: num })),
)

// categories list is needed to pick a category when setting a ceiling → allow manager to read
router.get('/categories-list', managerConfig, async (_req, res) => {
  res.json(await db.select().from(categories))
})

router.get('/audit', managerConfig, listAudit)

router.get('/settings', managerConfig, getSettings)
router.patch('/settings', managerConfig, updateSettings)

export default router
