import { Router } from 'express'
import { z } from 'zod'
import { db } from '../config/db.js'
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js'
import { crud, num, tier } from '../utils/crud.js'
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

/* ---- catalog / infrastructure: admin only ---- */
router.use('/categories', adminOnly, crud(categories, z.object({ name: z.string().min(1) })))

router.use(
  '/customers',
  adminOnly,
  crud(
    customers,
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      tier: z.enum(['bronze', 'silver', 'gold']),
    }),
  ),
)

router.get('/products', adminOnly, listProductsAdmin)
router.get('/products/:id/stock', adminOnly, productStockDetail)
router.use(
  '/products',
  adminOnly,
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

router.use('/price-list', adminOnly, crud(priceListItems, z.object({ productId: z.string().uuid(), tier, unitPrice: num })))

router.use('/warehouses', adminOnly, crud(warehouses, z.object({ name: z.string().min(1), shippingCostWeight: num.optional() })))

router.use(
  '/subscription-plans',
  adminOnly,
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
router.get('/pairings', adminOnly, listPairings)
router.use(
  '/pairings',
  adminOnly,
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
router.get('/variants', adminOnly, listVariants)
router.use(
  '/variants',
  adminOnly,
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

router.get('/stock', adminOnly, listStock)
router.post('/stock', adminOnly, upsertStock)
router.delete('/stock/:id', adminOnly, deleteStock)

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
