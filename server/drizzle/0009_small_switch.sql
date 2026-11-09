CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT (current_setting('app.org_id'))::uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping_address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
-- contacts is a company table: same index, row-level security and same-company FK as 0006/0007;
--> statement-breakpoint
CREATE INDEX "contacts_organization_id_idx" ON "contacts" ("organization_id");
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contacts" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_same_org" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers" ("organization_id", "id") ON DELETE CASCADE;
