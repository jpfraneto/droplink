CREATE TABLE IF NOT EXISTS "scout_checkout_sessions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "stripe_session_id" text NOT NULL,
  "submitted_url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "canonical_root_domain" varchar(255) NOT NULL,
  "root_domain_hash" varchar(128) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "scout_user_id" varchar(64),
  "scout_username" varchar(64),
  "summoner_wallet" text,
  "creator_display_name" text,
  "amount_total" integer,
  "currency" varchar(8),
  "status" varchar(32) DEFAULT 'created' NOT NULL,
  "generation_job_id" varchar(64),
  "drop_id" varchar(64),
  "error" text,
  "metadata_json" jsonb,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scout_checkout_sessions_stripe_session_id_unique" UNIQUE ("stripe_session_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scout_checkout_sessions"
    ADD CONSTRAINT "scout_checkout_sessions_scout_user_id_app_users_id_fk"
    FOREIGN KEY ("scout_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scout_checkout_sessions"
    ADD CONSTRAINT "scout_checkout_sessions_drop_id_drops_id_fk"
    FOREIGN KEY ("drop_id") REFERENCES "drops"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_checkout_sessions_root_domain_hash_idx" ON "scout_checkout_sessions" ("root_domain_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_checkout_sessions_status_idx" ON "scout_checkout_sessions" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" varchar(128) NOT NULL,
  "livemode" boolean DEFAULT false NOT NULL,
  "stripe_created_at" timestamp with time zone,
  "status" varchar(32) DEFAULT 'processing' NOT NULL,
  "error" text,
  "metadata_json" jsonb,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_events_type_idx" ON "stripe_events" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_events_status_idx" ON "stripe_events" ("status");
