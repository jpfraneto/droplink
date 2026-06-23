import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const brands = pgTable("brands", {
  id: varchar("id", { length: 64 }).primaryKey(),
  canonicalUrl: text("canonical_url").notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: text("name").notNull(),
  ...timestamps
});

export const storefronts = pgTable("storefronts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  brandId: varchar("brand_id", { length: 64 }).notNull().references(() => brands.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  tier: varchar("tier", { length: 32 }).notNull().default("free"),
  claimStatus: varchar("claim_status", { length: 32 }).notNull().default("unclaimed"),
  commerceMode: varchar("commerce_mode", { length: 32 }).notNull().default("preview"),
  commissionBps: integer("commission_bps").notNull().default(800),
  customDomain: text("custom_domain"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  generationStatus: varchar("generation_status", { length: 64 }).notNull().default("INTAKE_CREATED"),
  generationTraceId: varchar("generation_trace_id", { length: 64 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps
});

export const brandSnapshots = pgTable("brand_snapshots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  brandId: varchar("brand_id", { length: 64 }).notNull().references(() => brands.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  textSample: text("text_sample").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const brandStudies = pgTable("brand_studies", {
  id: varchar("id", { length: 64 }).primaryKey(),
  brandId: varchar("brand_id", { length: 64 }).notNull().references(() => brands.id, { onDelete: "cascade" }),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
  modelVersion: varchar("model_version", { length: 64 }).notNull(),
  studyJson: jsonb("study_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const collections = pgTable("collections", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  relicCount: integer("relic_count").notNull(),
  ogImageId: varchar("og_image_id", { length: 64 }),
  generatorVersion: varchar("generator_version", { length: 64 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const relicPlans = pgTable("relic_plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
  modelVersion: varchar("model_version", { length: 64 }).notNull(),
  planJson: jsonb("plan_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const relics = pgTable("relics", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: text("name").notNull(),
  archetype: varchar("archetype", { length: 64 }).notNull(),
  productFamily: varchar("product_family", { length: 120 }).notNull(),
  description: text("description").notNull(),
  whyThisExists: text("why_this_exists").notNull(),
  artDirection: text("art_direction").notNull(),
  printfulProductId: text("printful_product_id"),
  printfulVariantId: text("printful_variant_id"),
  fulfillmentSpecJson: jsonb("fulfillment_spec_json"),
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  totalSupply: integer("total_supply").notNull().default(8),
  soldCount: integer("sold_count").notNull().default(0),
  reservedCount: integer("reserved_count").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  ...timestamps
}, (table) => ({
  collectionSlugUnique: uniqueIndex("relics_collection_slug_unique").on(table.collectionId, table.slug)
}));

export const relicEditions = pgTable("relic_editions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "cascade" }),
  editionNumber: integer("edition_number").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("available"),
  checkoutSessionId: varchar("checkout_session_id", { length: 64 }),
  orderId: varchar("order_id", { length: 64 }),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  relicEditionUnique: uniqueIndex("relic_editions_relic_number_unique").on(table.relicId, table.editionNumber)
}));

export const assets = pgTable("assets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).references(() => collections.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).references(() => relics.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  url: text("url").notNull(),
  storageProvider: varchar("storage_provider", { length: 32 }).notNull().default("local"),
  width: integer("width"),
  height: integer("height"),
  checksum: varchar("checksum", { length: 128 }),
  prompt: text("prompt"),
  validationStatus: varchar("validation_status", { length: 32 }).notNull().default("pending"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const mockups = pgTable("mockups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "cascade" }),
  assetId: varchar("asset_id", { length: 64 }).references(() => assets.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull(),
  printfulTaskId: text("printful_task_id"),
  viewName: varchar("view_name", { length: 64 }).notNull().default("front"),
  status: varchar("status", { length: 32 }).notNull().default("mock"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const ogImages = pgTable("og_images", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  assetId: varchar("asset_id", { length: 64 }).references(() => assets.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  prompt: text("prompt").notNull(),
  compositionJson: jsonb("composition_json"),
  status: varchar("status", { length: 32 }).notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const checkoutSessions = pgTable("checkout_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "cascade" }),
  relicEditionId: varchar("relic_edition_id", { length: 64 }).notNull().references(() => relicEditions.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 32 }).notNull().default("created"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps
});

export const orders = pgTable("orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  checkoutSessionId: varchar("checkout_session_id", { length: 64 }).notNull().references(() => checkoutSessions.id, { onDelete: "restrict" }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "restrict" }),
  relicEditionId: varchar("relic_edition_id", { length: 64 }).notNull().references(() => relicEditions.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 32 }).notNull(),
  customerEmail: text("customer_email"),
  shippingJson: jsonb("shipping_json"),
  ...timestamps
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const claims = pgTable("claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  txtName: text("txt_name").notNull(),
  txtValue: text("txt_value").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const fulfillmentOrders = pgTable("fulfillment_orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 32 }).notNull().default("printful"),
  providerOrderId: text("provider_order_id"),
  providerExternalId: text("provider_external_id"),
  status: varchar("status", { length: 32 }).notNull().default("draft_created"),
  requestJson: jsonb("request_json"),
  responseJson: jsonb("response_json"),
  dashboardUrl: text("dashboard_url"),
  trackingUrl: text("tracking_url"),
  costsJson: jsonb("costs_json"),
  webhookEventsJson: jsonb("webhook_events_json"),
  ...timestamps
});

export const printfulCatalogCache = pgTable("printful_catalog_cache", {
  cacheKey: varchar("cache_key", { length: 120 }).primaryKey(),
  dataJson: jsonb("data_json").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
});

export const stripeAccounts = pgTable("stripe_accounts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  ...timestamps
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: varchar("status", { length: 32 }).notNull().default("manual"),
  priceCents: integer("price_cents").notNull().default(8800),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  ...timestamps
});

export const adminReviews = pgTable("admin_reviews", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id", { length: 64 }).references(() => collections.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  checklistJson: jsonb("checklist_json").notNull(),
  notes: text("notes"),
  ...timestamps
});

export const generationJobs = pgTable("generation_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).references(() => storefronts.id, { onDelete: "set null" }),
  collectionId: varchar("collection_id", { length: 64 }).references(() => collections.id, { onDelete: "set null" }),
  traceId: varchar("trace_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  currentStep: varchar("current_step", { length: 64 }).notNull(),
  inputJson: jsonb("input_json").notNull(),
  error: text("error"),
  ...timestamps
});

export const systemEvents = pgTable("system_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 96 }).notNull(),
  level: varchar("level", { length: 16 }).notNull().default("info"),
  message: text("message").notNull(),
  metadataJson: jsonb("metadata_json"),
  requestId: varchar("request_id", { length: 64 }),
  traceId: varchar("trace_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
