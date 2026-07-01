ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "checkout_paused" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "checkout_pause_reason" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_details_submitted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_requirements_currently_due" jsonb;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_requirements_eventually_due" jsonb;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_disabled_reason" text;
--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "stripe_connect_last_account_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_session_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_charge_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_refund_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payout_blocked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payout_block_reason" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_orders_order_provider_unique" ON "fulfillment_orders" ("order_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fulfillment_orders_provider_external_id_idx" ON "fulfillment_orders" ("provider", "provider_external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_stripe_session_id_idx" ON "orders" ("stripe_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_stripe_charge_id_idx" ON "orders" ("stripe_charge_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" varchar(120) PRIMARY KEY NOT NULL,
  "value_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_transfers" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "order_id" varchar(64) NOT NULL,
  "ledger_accrual_id" varchar(64),
  "beneficiary_type" varchar(32) NOT NULL,
  "stripe_account_id" text NOT NULL,
  "stripe_transfer_id" text,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "transfer_group" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata_json" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stripe_transfers_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade,
  CONSTRAINT "stripe_transfers_ledger_accrual_id_ledger_accruals_id_fk"
    FOREIGN KEY ("ledger_accrual_id") REFERENCES "ledger_accruals"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_transfers_idempotency_key_unique" ON "stripe_transfers" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_transfers_stripe_transfer_id_unique" ON "stripe_transfers" ("stripe_transfer_id") WHERE "stripe_transfer_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_transfers_order_id_idx" ON "stripe_transfers" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_transfers_status_idx" ON "stripe_transfers" ("status");
