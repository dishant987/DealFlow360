import { Router } from 'express'
import { z } from 'zod'
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
} from '../models/schema.js'
import {
  listStock,
  upsertStock,
  deleteStock,
  getSettings,
  updateSettings,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/config.controller.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))

/* ---- flat resources (A2–A6) via generic CRUD ---- */
router.use('/categories', crud(categories, z.object({ name: z.string().min(1) })))

router.use(
  '/products',
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

router.use('/price-list', crud(priceListItems, z.object({ productId: z.string().uuid(), tier, unitPrice: num })))

router.use('/discount-tiers', crud(discountTiers, z.object({ tier, maxDiscountPct: num })))

router.use(
  '/category-ceilings',
  crud(categoryDiscountCeilings, z.object({ categoryId: z.string().uuid(), maxDiscountPct: num })),
)

router.use(
  '/warehouses',
  crud(warehouses, z.object({ name: z.string().min(1), shippingCostWeight: num.optional() })),
)

router.use(
  '/subscription-plans',
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

router.use(
  '/pairings',
  crud(
    productPairings,
    z.object({
      productId: z.string().uuid(),
      suggestedProductId: z.string().uuid(),
      score: z.number().int().optional(),
    }),
  ),
)

/* ---- special resources via controllers ---- */
router.get('/stock', listStock)
router.post('/stock', upsertStock)
router.delete('/stock/:id', deleteStock)

router.get('/settings', getSettings)
router.patch('/settings', updateSettings)

router.get('/users', listUsers)
router.post('/users', createUser)
router.patch('/users/:id', updateUser)
router.delete('/users/:id', deleteUser)

export default router
