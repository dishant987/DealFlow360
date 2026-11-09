-- Multi-tenancy (step 9). Hand-ordered so it works on a database that already has data:
-- existing rows go to one default company before the columns become NOT NULL.
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organizations" ("id", "name") VALUES ('00000000-0000-4000-8000-000000000001', 'Default company');
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "customers" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "customers_organization_id_idx" ON "customers" ("organization_id");
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "categories" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "categories_organization_id_idx" ON "categories" ("organization_id");
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "products" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "products_organization_id_idx" ON "products" ("organization_id");
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "price_list_items" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "price_list_items" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "price_list_items" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "price_list_items_organization_id_idx" ON "price_list_items" ("organization_id");
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "product_variants" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "product_variants_organization_id_idx" ON "product_variants" ("organization_id");
--> statement-breakpoint
ALTER TABLE "discount_tiers" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "discount_tiers" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "discount_tiers" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "discount_tiers" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "discount_tiers_organization_id_idx" ON "discount_tiers" ("organization_id");
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "category_discount_ceilings" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "category_discount_ceilings_organization_id_idx" ON "category_discount_ceilings" ("organization_id");
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "warehouses" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "warehouses_organization_id_idx" ON "warehouses" ("organization_id");
--> statement-breakpoint
ALTER TABLE "stock" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "stock" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "stock" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "stock_organization_id_idx" ON "stock" ("organization_id");
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "subscription_plans" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "subscription_plans" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscription_plans" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "subscription_plans_organization_id_idx" ON "subscription_plans" ("organization_id");
--> statement-breakpoint
ALTER TABLE "product_pairings" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "product_pairings" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "product_pairings" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_pairings" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "product_pairings_organization_id_idx" ON "product_pairings" ("organization_id");
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "app_settings" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_settings" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "app_settings_organization_id_idx" ON "app_settings" ("organization_id");
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "quotations" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "quotations" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotations" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "quotations_organization_id_idx" ON "quotations" ("organization_id");
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "quote_lines" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "quote_lines" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "quote_lines_organization_id_idx" ON "quote_lines" ("organization_id");
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "approvals" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "approvals" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "approvals_organization_id_idx" ON "approvals" ("organization_id");
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "audit_log" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "audit_log_organization_id_idx" ON "audit_log" ("organization_id");
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "fulfillment_allocations" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "fulfillment_allocations_organization_id_idx" ON "fulfillment_allocations" ("organization_id");
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "invoices" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "invoices_organization_id_idx" ON "invoices" ("organization_id");
--> statement-breakpoint
ALTER TABLE "billing_schedules" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "billing_schedules" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "billing_schedules" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_schedules" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "billing_schedules_organization_id_idx" ON "billing_schedules" ("organization_id");
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "payments" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "payments_organization_id_idx" ON "payments" ("organization_id");
--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "credit_notes" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "credit_notes_organization_id_idx" ON "credit_notes" ("organization_id");
--> statement-breakpoint
ALTER TABLE "negotiation_requests" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "negotiation_requests" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "negotiation_requests" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "negotiation_requests" ALTER COLUMN "organization_id" SET DEFAULT (current_setting('app.org_id'))::uuid;
--> statement-breakpoint
CREATE INDEX "negotiation_requests_organization_id_idx" ON "negotiation_requests" ("organization_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "users" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" ("organization_id");
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" ADD CONSTRAINT "category_discount_ceilings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "discount_tiers" ADD CONSTRAINT "discount_tiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "negotiation_requests" ADD CONSTRAINT "negotiation_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_pairings" ADD CONSTRAINT "product_pairings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";
--> statement-breakpoint
ALTER TABLE "discount_tiers" DROP CONSTRAINT "discount_tiers_tier_unique";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_sku_unique";
--> statement-breakpoint
ALTER TABLE "warehouses" DROP CONSTRAINT "warehouses_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_name_uq" ON "categories" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "discount_tiers_org_tier_uq" ON "discount_tiers" USING btree ("organization_id","tier");
--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_uq" ON "products" USING btree ("organization_id","sku");
--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_org_name_uq" ON "warehouses" USING btree ("organization_id","name");
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "customers" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "categories" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "products" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "price_list_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_list_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "price_list_items" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "product_variants" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "discount_tiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discount_tiers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "discount_tiers" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_discount_ceilings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "category_discount_ceilings" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "warehouses" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "stock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "subscription_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscription_plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subscription_plans" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "product_pairings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_pairings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "product_pairings" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app_settings" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "quotations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotations" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "quote_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "quote_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quote_lines" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approvals" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_log" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fulfillment_allocations" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoices" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "billing_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_schedules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "billing_schedules" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payments" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "credit_notes" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "negotiation_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "negotiation_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "negotiation_requests" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
