CREATE TABLE IF NOT EXISTS "drops" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "storefront_id" varchar(64) NOT NULL,
  "original_submitted_url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "canonical_domain" varchar(255) NOT NULL,
  "domain_hash" varchar(128) NOT NULL,
  "status" varchar(32) DEFAULT 'summoned' NOT NULL,
  "summoner_wallet" text,
  "creator_display_name" text,
  "summon_payment_tx_hash" text,
  "summon_payment_metadata_json" jsonb,
  "summon_price_usdc" varchar(32) DEFAULT '8' NOT NULL,
  "creator_bounty_bps" integer DEFAULT 800 NOT NULL,
  "protocol_fee_bps" integer DEFAULT 0 NOT NULL,
  "total_supply" integer DEFAULT 24 NOT NULL,
  "relics_per_drop" integer DEFAULT 3 NOT NULL,
  "editions_per_relic" integer DEFAULT 8 NOT NULL,
  "dns_claim_nonce" text,
  "dns_record_name" text,
  "dns_record_value" text,
  "domain_owner_wallet" text,
  "domain_owner_email" text,
  "domain_claim_proof_json" jsonb,
  "domain_claimed_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "sold_out_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "readiness_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drops" ADD CONSTRAINT "drops_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drops_domain_hash_unique" ON "drops" ("domain_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drops_canonical_url_unique" ON "drops" ("canonical_url");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drops_storefront_unique" ON "drops" ("storefront_id");
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relics" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "relics" ADD COLUMN IF NOT EXISTS "relic_index" integer;
--> statement-breakpoint
ALTER TABLE "relics" ADD CONSTRAINT "relics_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "global_edition_number" integer;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "reserved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "buyer_email_hash" varchar(128);
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "printful_order_id" text;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD COLUMN IF NOT EXISTS "onchain_receipt_tx_hash" text;
--> statement-breakpoint
ALTER TABLE "relic_editions" ADD CONSTRAINT "relic_editions_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relic_editions_drop_global_number_unique" ON "relic_editions" ("drop_id","global_edition_number");
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gross_amount" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'usd';
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_fee_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_cost_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_reserve_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "net_margin_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "creator_bounty_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "domain_owner_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "protocol_fee_amount" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_order_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_status" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_dashboard_url" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_tracking_url" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "printful_costs_json" jsonb;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settlement_status" varchar(32);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "onchain_receipt_tx_hash" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_accruals" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "drop_id" varchar(64) NOT NULL,
  "order_id" varchar(64) NOT NULL,
  "beneficiary_type" varchar(32) NOT NULL,
  "beneficiary_wallet" text,
  "amount" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "status" varchar(32) DEFAULT 'accrued' NOT NULL,
  "reason" text NOT NULL,
  "tx_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accruals" ADD CONSTRAINT "ledger_accruals_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_accruals" ADD CONSTRAINT "ledger_accruals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accruals_order_beneficiary_unique" ON "ledger_accruals" ("order_id","beneficiary_type");
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "drop_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "claimant_wallet" text;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "claimant_email" text;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "proof_json" jsonb;
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "storefronts" DROP COLUMN IF EXISTS "tier";
--> statement-breakpoint
ALTER TABLE "storefronts" ALTER COLUMN "commission_bps" SET DEFAULT 0;
--> statement-breakpoint
DROP TABLE IF EXISTS "subscriptions";
