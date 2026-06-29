CREATE TABLE IF NOT EXISTS "drop_notifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"drop_id" varchar(64) NOT NULL,
	"relic_id" varchar(64),
	"email" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"source" varchar(32) DEFAULT 'preview_buy_modal' NOT NULL,
	"notified_at" timestamp with time zone,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drop_notifications" ADD CONSTRAINT "drop_notifications_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "drops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drop_notifications" ADD CONSTRAINT "drop_notifications_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "relics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_notifications_drop_relic_email_unique" ON "drop_notifications" ("drop_id","relic_id","email");
