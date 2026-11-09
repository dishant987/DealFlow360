ALTER TABLE "quotations" ADD COLUMN "portal_token_expires_at" timestamp with time zone;--> statement-breakpoint
-- links that existed before expiry was introduced get 30 days instead of breaking on deploy
UPDATE "quotations" SET "portal_token_expires_at" = now() + interval '30 days' WHERE "portal_token" IS NOT NULL;
