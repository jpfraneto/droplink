ALTER TABLE "relics" ADD COLUMN "fulfillment_spec_json" jsonb;
--> statement-breakpoint
CREATE TABLE "asset_blobs" (
	"asset_id" varchar(64) PRIMARY KEY NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printful_catalog_cache" (
	"cache_key" varchar(120) PRIMARY KEY NOT NULL,
	"data_json" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fulfillment_orders" ADD COLUMN "provider_external_id" text;
--> statement-breakpoint
ALTER TABLE "fulfillment_orders" ADD COLUMN "dashboard_url" text;
--> statement-breakpoint
ALTER TABLE "fulfillment_orders" ADD COLUMN "costs_json" jsonb;
--> statement-breakpoint
ALTER TABLE "fulfillment_orders" ADD COLUMN "webhook_events_json" jsonb;
--> statement-breakpoint
ALTER TABLE "asset_blobs" ADD CONSTRAINT "asset_blobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
