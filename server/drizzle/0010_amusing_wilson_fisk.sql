ALTER TABLE "quotations" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "customer_po" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "notes_to_customer" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
-- a quote can only be addressed to a contact of its own company (RLS does not cover FK checks).
-- NO ACTION, not SET NULL: deleting a contact nulls contact_id via the FK above, and a NULL passes this one.
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_org_id_uq" ON "contacts" ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_same_org" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts" ("organization_id", "id");
