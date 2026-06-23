CREATE TABLE "admin_reviews" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"collection_id" varchar(64),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"checklist_json" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"collection_id" varchar(64),
	"relic_id" varchar(64),
	"type" varchar(32) NOT NULL,
	"url" text NOT NULL,
	"storage_provider" varchar(32) DEFAULT 'local' NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" varchar(128),
	"prompt" text,
	"validation_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_snapshots" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"brand_id" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"text_sample" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_studies" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"brand_id" varchar(64) NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"model_version" varchar(64) NOT NULL,
	"study_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"stripe_session_id" text NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"collection_id" varchar(64) NOT NULL,
	"relic_id" varchar(64) NOT NULL,
	"relic_edition_id" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_sessions_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"txt_name" text NOT NULL,
	"txt_value" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"relic_count" integer NOT NULL,
	"og_image_id" varchar(64),
	"generator_version" varchar(64) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_orders" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"provider" varchar(32) DEFAULT 'printful' NOT NULL,
	"provider_order_id" text,
	"status" varchar(32) DEFAULT 'draft_created' NOT NULL,
	"request_json" jsonb,
	"response_json" jsonb,
	"tracking_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64),
	"collection_id" varchar(64),
	"trace_id" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"current_step" varchar(64) NOT NULL,
	"input_json" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mockups" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"relic_id" varchar(64) NOT NULL,
	"asset_id" varchar(64),
	"image_url" text NOT NULL,
	"printful_task_id" text,
	"view_name" varchar(64) DEFAULT 'front' NOT NULL,
	"status" varchar(32) DEFAULT 'mock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "og_images" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"collection_id" varchar(64) NOT NULL,
	"asset_id" varchar(64),
	"image_url" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"prompt" text NOT NULL,
	"composition_json" jsonb,
	"status" varchar(32) DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"checkout_session_id" varchar(64) NOT NULL,
	"stripe_payment_intent_id" text,
	"storefront_id" varchar(64) NOT NULL,
	"collection_id" varchar(64) NOT NULL,
	"relic_id" varchar(64) NOT NULL,
	"relic_edition_id" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"customer_email" text,
	"shipping_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relic_editions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"relic_id" varchar(64) NOT NULL,
	"edition_number" integer NOT NULL,
	"status" varchar(32) DEFAULT 'available' NOT NULL,
	"checkout_session_id" varchar(64),
	"order_id" varchar(64),
	"reserved_until" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relic_plans" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"collection_id" varchar(64) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"model_version" varchar(64) NOT NULL,
	"plan_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relics" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"collection_id" varchar(64) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"archetype" varchar(64) NOT NULL,
	"product_family" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"why_this_exists" text NOT NULL,
	"art_direction" text NOT NULL,
	"printful_product_id" text,
	"printful_variant_id" text,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"total_supply" integer DEFAULT 8 NOT NULL,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefronts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"brand_id" varchar(64) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"tier" varchar(32) DEFAULT 'free' NOT NULL,
	"claim_status" varchar(32) DEFAULT 'unclaimed' NOT NULL,
	"commerce_mode" varchar(32) DEFAULT 'preview' NOT NULL,
	"commission_bps" integer DEFAULT 800 NOT NULL,
	"custom_domain" text,
	"stripe_connected_account_id" text,
	"generation_status" varchar(64) DEFAULT 'INTAKE_CREATED' NOT NULL,
	"generation_trace_id" varchar(64),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefronts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"stripe_account_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"storefront_id" varchar(64) NOT NULL,
	"stripe_subscription_id" text,
	"status" varchar(32) DEFAULT 'manual' NOT NULL,
	"price_cents" integer DEFAULT 8800 NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"level" varchar(16) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata_json" jsonb,
	"request_id" varchar(64),
	"trace_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_snapshots" ADD CONSTRAINT "brand_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_studies" ADD CONSTRAINT "brand_studies_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_studies" ADD CONSTRAINT "brand_studies_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_relic_edition_id_relic_editions_id_fk" FOREIGN KEY ("relic_edition_id") REFERENCES "public"."relic_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "og_images" ADD CONSTRAINT "og_images_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "og_images" ADD CONSTRAINT "og_images_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_relic_edition_id_relic_editions_id_fk" FOREIGN KEY ("relic_edition_id") REFERENCES "public"."relic_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relic_editions" ADD CONSTRAINT "relic_editions_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relic_plans" ADD CONSTRAINT "relic_plans_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relics" ADD CONSTRAINT "relics_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relic_editions_relic_number_unique" ON "relic_editions" USING btree ("relic_id","edition_number");--> statement-breakpoint
CREATE UNIQUE INDEX "relics_collection_slug_unique" ON "relics" USING btree ("collection_id","slug");