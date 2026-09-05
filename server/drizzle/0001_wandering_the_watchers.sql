ALTER TYPE "public"."billing_status" ADD VALUE 'paused' BEFORE 'cancelled';--> statement-breakpoint
ALTER TABLE "negotiation_requests" ADD COLUMN "requested_delivery_date" timestamp with time zone;