ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "submitted_host" varchar(255);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "submitted_path" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "source_url" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "canonical_root_domain" varchar(255);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "registrable_domain" varchar(255);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "root_domain_hash" varchar(128);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "domain_claim_status" varchar(32) DEFAULT 'unclaimed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_status" varchar(32) DEFAULT 'missing' NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_method" varchar(32) DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "publish_status" varchar(32) DEFAULT 'blocked' NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "domain_owner_name" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "tempo_wallet_address" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "tempo_wallet_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "tempo_wallet_verification_proof_json" jsonb;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_nonce" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_dns_record_name" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_dns_record_value" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_status" varchar(64);
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_onboarding_url" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "payout_configured_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "price_book_json" jsonb;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "projected_economics_json" jsonb;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "price_book_locked_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "drops"
SET canonical_root_domain = COALESCE(canonical_root_domain, canonical_domain),
    registrable_domain = COALESCE(registrable_domain, canonical_domain),
    root_domain_hash = COALESCE(root_domain_hash, domain_hash),
    source_url = COALESCE(source_url, canonical_url),
    submitted_host = COALESCE(submitted_host, canonical_domain),
    submitted_path = COALESCE(submitted_path, '/'),
    domain_claim_status = CASE WHEN domain_claimed_at IS NULL THEN domain_claim_status ELSE 'verified' END,
    payout_status = COALESCE(payout_status, 'missing'),
    payout_method = COALESCE(payout_method, 'none'),
    publish_status = CASE WHEN status = 'published' THEN 'published' ELSE publish_status END;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drops_root_domain_hash_unique" ON "drops" ("root_domain_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_source_signals" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "drop_id" varchar(64) NOT NULL,
  "submitted_url" text NOT NULL,
  "submitted_host" varchar(255) NOT NULL,
  "submitted_path" text NOT NULL,
  "normalized_url" text NOT NULL,
  "submitted_by_wallet" text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "used_for_generation" boolean DEFAULT false NOT NULL,
  "signal_metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_source_signals" ADD CONSTRAINT "drop_source_signals_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relics" ADD COLUMN IF NOT EXISTS "unit_price_usd" varchar(32);
--> statement-breakpoint
ALTER TABLE "relics" ADD COLUMN IF NOT EXISTS "price_book_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "relics" ADD COLUMN IF NOT EXISTS "price_locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "economics_status" varchar(32) DEFAULT 'estimated' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "price_book_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "admin_review_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "claimant_name" text;
--> statement-breakpoint
ALTER TABLE "ledger_accruals" ALTER COLUMN "status" SET DEFAULT 'pending';
