import { boolean, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const drops = pgTable("drops", {
  id: varchar("id", { length: 64 }).primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  sourceDomain: varchar("source_domain", { length: 255 }).notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceDescription: text("source_description").notNull(),
  brandName: text("brand_name").notNull(),
  brandSummary: text("brand_summary").notNull(),
  audience: text("audience").notNull(),
  collectionName: text("collection_name").notNull(),
  collectionTagline: text("collection_tagline").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("preview"),
  isClaimed: boolean("is_claimed").notNull().default(false),
  ownerEmail: text("owner_email"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  platformFeeBps: integer("platform_fee_bps").notNull().default(800),
  receiptJson: jsonb("receipt_json").notNull(),
  receiptHash: varchar("receipt_hash", { length: 64 }).notNull(),
  capsuleJson: jsonb("capsule_json"),
  capsuleHash: varchar("capsule_hash", { length: 64 }),
  ogImageUrl: text("og_image_url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps
});

export const products = pgTable("products", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 })
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: text("name").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  description: text("description").notNull(),
  whyThisProduct: text("why_this_product").notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  imagePrompt: text("image_prompt").notNull(),
  imageUrl: text("image_url"),
  mockupUrl: text("mockup_url"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  position: integer("position").notNull(),
  ...timestamps
});

export const generationJobs = pgTable("generation_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  inputJson: jsonb("input_json").notNull(),
  logsJson: jsonb("logs_json").notNull(),
  error: text("error"),
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "set null" }),
  ...timestamps
});

export const orders = pgTable("orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 })
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 64 }).references(() => products.id, { onDelete: "set null" }),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountSubtotalCents: integer("amount_subtotal_cents").notNull(),
  amountTotalCents: integer("amount_total_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  customerEmail: text("customer_email"),
  fulfillmentStatus: varchar("fulfillment_status", { length: 32 }).notNull().default("pending"),
  ...timestamps
});

export const claims = pgTable("claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 })
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  verificationMethod: varchar("verification_method", { length: 64 }).notNull().default("email_domain"),
  ...timestamps
});
