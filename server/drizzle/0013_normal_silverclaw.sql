CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT (current_setting('app.org_id'))::uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_name" text,
	"signed_at" timestamp with time zone,
	"signed_ip" text,
	"signed_user_agent" text
);
--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_quote_version_uq" ON "quote_versions" USING btree ("quotation_id","version");--> statement-breakpoint
-- quote_versions is a company table: same index, row-level security and same-company FK as 0006/0007
CREATE INDEX "quote_versions_organization_id_idx" ON "quote_versions" ("organization_id");
--> statement-breakpoint
ALTER TABLE "quote_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "quote_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quote_versions" USING ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on') WITH CHECK ("organization_id" = nullif(current_setting('app.org_id', true), '')::uuid OR current_setting('app.rls_bypass', true) = 'on');
--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quotation_id_same_org" FOREIGN KEY ("organization_id", "quotation_id") REFERENCES "quotations" ("organization_id", "id") ON DELETE CASCADE;
