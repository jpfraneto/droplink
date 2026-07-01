CREATE TABLE IF NOT EXISTS "app_users" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "x_id" varchar(128) NOT NULL,
  "username" varchar(64) NOT NULL,
  "display_name" text NOT NULL,
  "avatar_url" text,
  "profile_url" text NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_users_x_id_unique" UNIQUE ("x_id"),
  CONSTRAINT "app_users_username_unique" UNIQUE ("username")
);

ALTER TABLE "drops" ADD COLUMN IF NOT EXISTS "scout_user_id" varchar(64);

DO $$ BEGIN
  ALTER TABLE "drops"
    ADD CONSTRAINT "drops_scout_user_id_app_users_id_fk"
    FOREIGN KEY ("scout_user_id") REFERENCES "app_users"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
