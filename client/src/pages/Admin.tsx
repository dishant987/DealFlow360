import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { ROLE_LABEL, roleLabel } from '@/lib/roles'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/AppShell'
import AuditLog from '@/components/AuditLog'
import StockPanel from '@/components/StockPanel'
import ResourceManager, { type Field } from '@/components/ResourceManager'
import StatusBadge from '@/components/StatusBadge'
import ImportDialog from '@/components/ImportDialog'
import InviteDialog from '@/components/InviteDialog'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CURRENCIES, humanize } from '@/lib/format'
import { Select } from '@/components/ui/select'

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
          currency: form.currency,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/config/settings'] })
      // the session carries the currency every amount is formatted in
      qc.invalidateQueries({ queryKey: ['me'] })
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
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="settings-currency">
          Currency (all amounts are shown in this)
        </Label>
        <Select
          id="settings-currency"
          className="w-48"
          value={form.currency ?? 'USD'}
          onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value }))}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
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

function TabGroupLabel({ children }: { children: ReactNode }) {
  return (
    <span className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

const SECTIONS: { label: string; items: [string, string][] }[] = [
  { label: 'Catalogue', items: [['products', 'Products'], ['categories', 'Categories'], ['variants', 'Variants'], ['pairings', 'Upsell Pairings'], ['plans', 'Subscription Plans']] },
  { label: 'Pricing & governance', items: [['tiers', 'Discount Tiers'], ['ceilings', 'Category Ceilings'], ['settings', 'Thresholds']] },
  { label: 'Operations', items: [['warehouses', 'Warehouses'], ['stock', 'Stock']] },
  { label: 'Team', items: [['users', 'Users']] },
  { label: 'Records', items: [['audit', 'Audit Log']] },
]

export default function Admin() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [stockFor, setStockFor] = useState<string | null>(null)
  return (
    <AppShell
      crumbs={[
        { label: 'Workspace', to: '/' },
        { label: 'Settings' },
      ]}
    >
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything the sales engine reads at runtime: catalogue, pricing, discount governance, stock
            {isAdmin ? ' and users' : ''}.
          </p>
        </div>

        <Tabs defaultValue="products" orientation="vertical" className="flex-col gap-6 md:flex-row md:items-start">
          {/* grouped menu on the left; two columns on a phone so it stays short */}
          <nav aria-label="Settings sections" className="grid grid-cols-2 gap-4 rounded-lg border bg-background p-3 md:sticky md:top-4 md:block md:w-52 md:shrink-0 md:space-y-4">
            {SECTIONS.filter((g) => isAdmin || g.label !== 'Team').map((g) => (
              <div key={g.label} className="space-y-1">
                <TabGroupLabel>{g.label}</TabGroupLabel>
                <TabsList variant="line" className="w-full items-stretch">
                  {g.items.map(([value, label]) => (
                    <TabsTrigger key={value} value={value} className="px-2 py-1.5 after:hidden data-active:bg-accent! data-active:text-foreground">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            <TabsContent value="products">
              <ResourceManager
                title="Product"
                description="The catalogue reps sell from. Price and cost drive every margin figure in the app."
                endpoint="/config/products"
                headerExtra={<ImportDialog kind="products" endpoint="/config/products" />}
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'sku', label: 'SKU' },
                  { key: 'category', label: 'Category' },
                  { key: 'type', label: 'Type', render: (r) => humanize(r.type) },
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
            </TabsContent>

            <TabsContent value="categories">
              <ResourceManager
                title="Category"
                plural="Categories"
                description="Groups products, and is what category discount ceilings apply to."
                endpoint="/config/categories"
                columns={[{ key: 'name', label: 'Name' }]}
                fields={[{ name: 'name', label: 'Name' }]}
              />
            </TabsContent>


            <TabsContent value="tiers">
              <ResourceManager
                title="Tier"
                plural="Discount tiers"
                description="The most any customer on that tier may be discounted, before category limits apply."
                endpoint="/config/discount-tiers"
                columns={[
                  { key: 'tier', label: 'Tier', render: (r) => humanize(r.tier) },
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
                plural="Category ceilings"
                description="A category's own discount limit. Each line is judged against min(tier, category)."
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

            <TabsContent value="warehouses">
              <ResourceManager
                title="Warehouse"
                description="Stock locations. Shipping weight decides which one the split logic prefers."
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
            </TabsContent>

            <TabsContent value="stock">
              <ResourceManager
                title="Stock"
                plural="Stock levels"
                description="Quantity per warehouse, plus the reorder rule: restock when it falls to 'Reorder at', and bring it back up to 'Restock to'."
                endpoint="/config/stock"
                columns={[
                  { key: 'warehouse', label: 'Warehouse' },
                  { key: 'product', label: 'Product' },
                  { key: 'quantity', label: 'Qty' },
                  { key: 'reorderLevel', label: 'Reorder at' },
                  { key: 'targetLevel', label: 'Restock to' },
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
                  { name: 'targetLevel', label: 'Restock to', type: 'number' },
                  { name: 'reorderLevel', label: 'Reorder', type: 'number' },
                ]}
              />
            </TabsContent>

              <TabsContent value="variants">
                <ResourceManager
                  title="Variant"
                  description="Attribute options on a product, each adding to the base price."
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

              <TabsContent value="pairings">
                <ResourceManager
                  title="Pairing"
                  plural="Upsell pairings"
                  description="Co-purchase links that drive the upsell panel while a rep builds a quote."
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

            <TabsContent value="plans">
              <ResourceManager
                title="Plan"
                plural="Subscription plans"
                description="Recurring plans: interval, whether mid-cycle changes prorate, and refund on cancellation."
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
            </TabsContent>

            {isAdmin && <TabsContent value="users">
              <ResourceManager
                title="User"
                description="Your team and their roles. Add teammates here — signing up creates a separate company."
                endpoint="/config/users"
                headerExtra={<InviteDialog />}
                columns={[
                  {
                    key: 'name',
                    label: 'Name',
                    render: (u) => (
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
                        {u.name}
                      </Link>
                    ),
                  },
                  { key: 'email', label: 'Email' },
                  { key: 'role', label: 'Role', render: (u) => roleLabel(u.role) },
                  { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.status} /> },
                  {
                    key: 'lastLoginAt',
                    label: 'Last sign-in',
                    render: (u) => (u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true }) : '—'),
                  },
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
                      { label: ROLE_LABEL.rep, value: 'rep' },
                      { label: ROLE_LABEL.manager, value: 'manager' },
                      { label: ROLE_LABEL.finance, value: 'finance' },
                      { label: ROLE_LABEL.admin, value: 'admin' },
                    ],
                    default: 'rep',
                  },
                  // blocking keeps the account and its history; it just can't sign in
                  { name: 'blocked', label: 'Blocked (cannot sign in)', type: 'boolean', default: false },
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
