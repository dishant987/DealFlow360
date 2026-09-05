import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import AuditLog from '@/components/AuditLog'
import StockPanel from '@/components/StockPanel'
import ResourceManager, { type Field } from '@/components/ResourceManager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const tierOpts = [
  { label: 'Bronze', value: 'bronze' },
  { label: 'Silver', value: 'silver' },
  { label: 'Gold', value: 'gold' },
]

function SettingsForm() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['/config/settings'],
    queryFn: async () => (await api.get('/config/settings')).data,
  })
  const [form, setForm] = useState<Record<string, any>>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch('/config/settings', {
          managerThreshold: form.managerThreshold,
          financeThreshold: form.financeThreshold,
          minUpsellMarginPct: form.minUpsellMarginPct,
          stalledDays: Number(form.stalledDays),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/config/settings'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Save failed'),
  })

  const field = (key: string, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        className="w-48"
        value={form[key] ?? ''}
        onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">
        Risk score above <b>Manager threshold</b> needs manager approval; above{' '}
        <b>Finance threshold</b> also needs finance.
      </p>
      {field('managerThreshold', 'Manager threshold (risk score)')}
      {field('financeThreshold', 'Finance threshold (risk score)')}
      {field('minUpsellMarginPct', 'Min upsell margin %')}
      {field('stalledDays', 'Stalled deal after (days)')}
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        Save settings
      </Button>
    </div>
  )
}

const productFields: Field[] = [
  { name: 'name', label: 'Name' },
  { name: 'sku', label: 'SKU' },
  { name: 'categoryId', label: 'Category', type: 'select', optionsFrom: '/config/categories' },
  {
    name: 'type',
    label: 'Type',
    type: 'select',
    options: [
      { label: 'One-time', value: 'onetime' },
      { label: 'Subscription', value: 'subscription' },
    ],
    default: 'onetime',
  },
  { name: 'unitPrice', label: 'Price', type: 'number' },
  { name: 'unitCost', label: 'Cost', type: 'number' },
  { name: 'unit', label: 'Unit' },
  { name: 'taxRate', label: 'Tax %', type: 'number' },
  { name: 'description', label: 'Description' },
  {
    name: 'subscriptionPlanId',
    label: 'Plan',
    type: 'select',
    optionsFrom: '/config/subscription-plans',
  },
  { name: 'isPromoted', label: 'Promoted', type: 'boolean' },
]

export default function Admin() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [stockFor, setStockFor] = useState<string | null>(null)
  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: isAdmin ? 'Backend Config' : 'Discount Config' },
      ]}
    >
      <div>
        <Tabs defaultValue={isAdmin ? 'products' : 'tiers'}>
          <TabsList className="flex-wrap h-auto">
            {isAdmin && <TabsTrigger value="products">Products</TabsTrigger>}
            {isAdmin && <TabsTrigger value="categories">Categories</TabsTrigger>}
            {isAdmin && <TabsTrigger value="customers">Customers</TabsTrigger>}
            <TabsTrigger value="tiers">Discount Tiers</TabsTrigger>
            <TabsTrigger value="ceilings">Category Ceilings</TabsTrigger>
            {isAdmin && <TabsTrigger value="warehouses">Warehouses</TabsTrigger>}
            {isAdmin && <TabsTrigger value="stock">Stock</TabsTrigger>}
            {isAdmin && <TabsTrigger value="variants">Variants</TabsTrigger>}
            {isAdmin && <TabsTrigger value="pairings">Upsell Pairings</TabsTrigger>}
            {isAdmin && <TabsTrigger value="plans">Subscription Plans</TabsTrigger>}
            {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {isAdmin && <TabsContent value="products">
              <ResourceManager
                title="Product"
                endpoint="/config/products"
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'sku', label: 'SKU' },
                  { key: 'category', label: 'Category' },
                  { key: 'type', label: 'Type' },
                  { key: 'unitPrice', label: 'Price' },
                  { key: 'unitCost', label: 'Cost' },
                  { key: 'stock', label: 'Stock' },
                  { key: 'stockByWarehouse', label: 'By warehouse' },
                ]}
                fields={productFields}
                rowActions={(row) => (
                  <Button size="sm" variant="ghost" onClick={() => setStockFor(row.id)}>
                    Stock
                  </Button>
                )}
              />
            </TabsContent>}

            {isAdmin && <TabsContent value="categories">
              <ResourceManager
                title="Category"
                endpoint="/config/categories"
                columns={[{ key: 'name', label: 'Name' }]}
                fields={[{ name: 'name', label: 'Name' }]}
              />
            </TabsContent>}

            {isAdmin && <TabsContent value="customers">
              <ResourceManager
                title="Customer"
                endpoint="/config/customers"
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'tier', label: 'Tier' },
                ]}
                fields={[
                  { name: 'name', label: 'Name' },
                  { name: 'email', label: 'Email' },
                  { name: 'tier', label: 'Tier', type: 'select', options: tierOpts, default: 'bronze' },
                ]}
              />
            </TabsContent>}

            <TabsContent value="tiers">
              <ResourceManager
                title="Tier"
                endpoint="/config/discount-tiers"
                columns={[
                  { key: 'tier', label: 'Tier' },
                  { key: 'maxDiscountPct', label: 'Max Discount %' },
                ]}
                fields={[
                  { name: 'tier', label: 'Tier', type: 'select', options: tierOpts },
                  { name: 'maxDiscountPct', label: 'Max Discount %', type: 'number' },
                ]}
              />
            </TabsContent>

            <TabsContent value="ceilings">
              <ResourceManager
                title="Ceiling"
                endpoint="/config/category-ceilings"
                columns={[
                  { key: 'category', label: 'Category' },
                  { key: 'maxDiscountPct', label: 'Max Discount %' },
                ]}
                fields={[
                  {
                    name: 'categoryId',
                    label: 'Category',
                    type: 'select',
                    optionsFrom: '/config/categories-list',
                  },
                  { name: 'maxDiscountPct', label: 'Max Discount %', type: 'number' },
                ]}
              />
            </TabsContent>

            {isAdmin && <TabsContent value="warehouses">
              <ResourceManager
                title="Warehouse"
                endpoint="/config/warehouses"
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'shippingCostWeight', label: 'Shipping Weight' },
                ]}
                fields={[
                  { name: 'name', label: 'Name' },
                  { name: 'shippingCostWeight', label: 'Shipping Weight', type: 'number' },
                ]}
              />
            </TabsContent>}

            {isAdmin && <TabsContent value="stock">
              <ResourceManager
                title="Stock"
                endpoint="/config/stock"
                columns={[
                  { key: 'warehouse', label: 'Warehouse' },
                  { key: 'product', label: 'Product' },
                  { key: 'quantity', label: 'Qty' },
                  { key: 'reorderLevel', label: 'Reorder' },
                ]}
                fields={[
                  {
                    name: 'warehouseId',
                    label: 'Warehouse',
                    type: 'select',
                    optionsFrom: '/config/warehouses',
                  },
                  {
                    name: 'productId',
                    label: 'Product',
                    type: 'select',
                    optionsFrom: '/config/products',
                  },
                  { name: 'quantity', label: 'Qty', type: 'number' },
                  { name: 'reorderLevel', label: 'Reorder', type: 'number' },
                ]}
              />
            </TabsContent>}

            {isAdmin && (
              <TabsContent value="variants">
                <ResourceManager
                  title="Variant"
                  endpoint="/config/variants"
                  columns={[
                    { key: 'product', label: 'Product' },
                    { key: 'attribute', label: 'Attribute' },
                    { key: 'value', label: 'Value' },
                    { key: 'extraPrice', label: 'Extra Price' },
                    { key: 'sku', label: 'SKU' },
                  ]}
                  fields={[
                    {
                      name: 'productId',
                      label: 'Product',
                      type: 'select',
                      optionsFrom: '/config/products',
                    },
                    { name: 'attribute', label: 'Attribute (e.g. Size)' },
                    { name: 'value', label: 'Value (e.g. Large)' },
                    { name: 'extraPrice', label: 'Extra Price', type: 'number' },
                    { name: 'sku', label: 'SKU' },
                  ]}
                />
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="pairings">
                <ResourceManager
                  title="Pairing"
                  endpoint="/config/pairings"
                  columns={[
                    { key: 'product', label: 'When buying' },
                    { key: 'suggested', label: 'Suggest' },
                    { key: 'score', label: 'Score' },
                  ]}
                  fields={[
                    {
                      name: 'productId',
                      label: 'When buying',
                      type: 'select',
                      optionsFrom: '/config/products',
                    },
                    {
                      name: 'suggestedProductId',
                      label: 'Suggest',
                      type: 'select',
                      optionsFrom: '/config/products',
                    },
                    { name: 'score', label: 'Score', type: 'number' },
                  ]}
                />
              </TabsContent>
            )}

            {isAdmin && <TabsContent value="plans">
              <ResourceManager
                title="Plan"
                endpoint="/config/subscription-plans"
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'interval', label: 'Interval' },
                  { key: 'cancellationRefundPct', label: 'Refund %' },
                ]}
                fields={[
                  { name: 'name', label: 'Name' },
                  {
                    name: 'interval',
                    label: 'Interval',
                    type: 'select',
                    options: [
                      { label: 'Monthly', value: 'monthly' },
                      { label: 'Quarterly', value: 'quarterly' },
                      { label: 'Yearly', value: 'yearly' },
                    ],
                    default: 'monthly',
                  },
                  { name: 'cancellationRefundPct', label: 'Refund %', type: 'number' },
                  { name: 'prorationEnabled', label: 'Proration', type: 'boolean', default: true },
                ]}
              />
            </TabsContent>}

            {isAdmin && <TabsContent value="users">
              <ResourceManager
                title="User"
                endpoint="/config/users"
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'role', label: 'Role' },
                ]}
                fields={[
                  { name: 'name', label: 'Name' },
                  { name: 'email', label: 'Email' },
                  { name: 'password', label: 'Password (blank = unchanged)' },
                  {
                    name: 'role',
                    label: 'Role',
                    type: 'select',
                    options: [
                      { label: 'Rep', value: 'rep' },
                      { label: 'Manager', value: 'manager' },
                      { label: 'Finance', value: 'finance' },
                      { label: 'Admin', value: 'admin' },
                    ],
                    default: 'rep',
                  },
                ]}
              />
            </TabsContent>}

            <TabsContent value="audit">
              <AuditLog />
            </TabsContent>

            <TabsContent value="settings">
              <SettingsForm />
            </TabsContent>
          </div>
        </Tabs>
      </div>
      <StockPanel productId={stockFor} onClose={() => setStockFor(null)} />
    </AppShell>
  )
}
