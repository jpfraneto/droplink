ALTER TABLE "brand_studies" ALTER COLUMN "prompt_version" TYPE varchar(128);
ALTER TABLE "brand_studies" ALTER COLUMN "model_version" TYPE varchar(128);
ALTER TABLE "collections" ALTER COLUMN "prompt_version" TYPE varchar(128);
ALTER TABLE "relic_plans" ALTER COLUMN "prompt_version" TYPE varchar(128);
ALTER TABLE "relic_plans" ALTER COLUMN "model_version" TYPE varchar(128);
