import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
  status: varchar("status", { length: 32 }).notNull().default("summoned"),
  claimStatus: varchar("claim_status", { length: 32 }).notNull().default("unclaimed"),
  commerceMode: varchar("commerce_mode", { length: 32 }).notNull().default("preview"),
  commissionBps: integer("commission_bps").notNull().default(0),
  customDomain: text("custom_domain"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  generationStatus: varchar("generation_status", { length: 64 }).notNull().default("INTAKE_CREATED"),
  generationTraceId: varchar("generation_trace_id", { length: 64 }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps
});

export const appUsers = pgTable("app_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  xId: varchar("x_id", { length: 128 }).notNull().unique(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  profileUrl: text("profile_url").notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps
});

export const drops = pgTable("drops", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  scoutUserId: varchar("scout_user_id", { length: 64 }).references(() => appUsers.id, { onDelete: "set null" }),
  originalSubmittedUrl: text("original_submitted_url").notNull(),
  submittedHost: varchar("submitted_host", { length: 255 }),
  submittedPath: text("submitted_path"),
  sourceUrl: text("source_url"),
  canonicalUrl: text("canonical_url").notNull(),
  canonicalDomain: varchar("canonical_domain", { length: 255 }).notNull(),
  canonicalRootDomain: varchar("canonical_root_domain", { length: 255 }),
  registrableDomain: varchar("registrable_domain", { length: 255 }),
  rootDomainHash: varchar("root_domain_hash", { length: 128 }),
  domainHash: varchar("domain_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("summoned"),
  domainClaimStatus: varchar("domain_claim_status", { length: 32 }).notNull().default("unclaimed"),
  payoutStatus: varchar("payout_status", { length: 32 }).notNull().default("missing"),
  payoutMethod: varchar("payout_method", { length: 32 }).notNull().default("none"),
  publishStatus: varchar("publish_status", { length: 32 }).notNull().default("blocked"),
  summonerWallet: text("summoner_wallet"),
  creatorDisplayName: text("creator_display_name"),
  summonPaymentTxHash: text("summon_payment_tx_hash"),
  summonPaymentMetadataJson: jsonb("summon_payment_metadata_json"),
  summonPriceUsdc: varchar("summon_price_usdc", { length: 32 }).notNull().default("8"),
  creatorBountyBps: integer("creator_bounty_bps").notNull().default(800),
  protocolFeeBps: integer("protocol_fee_bps").notNull().default(0),
  totalSupply: integer("total_supply").notNull().default(24),
  relicsPerDrop: integer("relics_per_drop").notNull().default(3),
  editionsPerRelic: integer("editions_per_relic").notNull().default(8),
  dnsClaimNonce: text("dns_claim_nonce"),
  dnsRecordName: text("dns_record_name"),
  dnsRecordValue: text("dns_record_value"),
  domainOwnerName: text("domain_owner_name"),
  domainOwnerWallet: text("domain_owner_wallet"),
  domainOwnerEmail: text("domain_owner_email"),
  domainClaimProofJson: jsonb("domain_claim_proof_json"),
  domainClaimedAt: timestamp("domain_claimed_at", { withTimezone: true }),
  tempoWalletAddress: text("tempo_wallet_address"),
  tempoWalletVerifiedAt: timestamp("tempo_wallet_verified_at", { withTimezone: true }),
  tempoWalletVerificationProofJson: jsonb("tempo_wallet_verification_proof_json"),
  payoutNonce: text("payout_nonce"),
  payoutDnsRecordName: text("payout_dns_record_name"),
  payoutDnsRecordValue: text("payout_dns_record_value"),
  stripeConnectAccountId: text("stripe_connect_account_id"),
  stripeConnectStatus: varchar("stripe_connect_status", { length: 64 }),
  stripeConnectOnboardingUrl: text("stripe_connect_onboarding_url"),
  stripeConnectChargesEnabled: boolean("stripe_connect_charges_enabled").notNull().default(false),
  stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled").notNull().default(false),
  stripeConnectDetailsSubmitted: boolean("stripe_connect_details_submitted").notNull().default(false),
  stripeConnectRequirementsCurrentlyDue: jsonb("stripe_connect_requirements_currently_due"),
  stripeConnectRequirementsEventuallyDue: jsonb("stripe_connect_requirements_eventually_due"),
  stripeConnectDisabledReason: text("stripe_connect_disabled_reason"),
  stripeConnectLastAccountUpdatedAt: timestamp("stripe_connect_last_account_updated_at", { withTimezone: true }),
  stripeConnectVerifiedAt: timestamp("stripe_connect_verified_at", { withTimezone: true }),
  payoutConfiguredAt: timestamp("payout_configured_at", { withTimezone: true }),
  checkoutPaused: boolean("checkout_paused").notNull().default(false),
  checkoutPauseReason: text("checkout_pause_reason"),
  priceBookJson: jsonb("price_book_json"),
  projectedEconomicsJson: jsonb("projected_economics_json"),
  priceBookLockedAt: timestamp("price_book_locked_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  soldOutAt: timestamp("sold_out_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  readinessJson: jsonb("readiness_json"),
  ...timestamps
}, (table) => ({
  dropDomainHashUnique: uniqueIndex("drops_domain_hash_unique").on(table.domainHash),
  dropRootDomainHashUnique: uniqueIndex("drops_root_domain_hash_unique").on(table.rootDomainHash),
  dropCanonicalUrlUnique: uniqueIndex("drops_canonical_url_unique").on(table.canonicalUrl),
  dropStorefrontUnique: uniqueIndex("drops_storefront_unique").on(table.storefrontId)
}));

export const dropSourceSignals = pgTable("drop_source_signals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 }).notNull().references(() => drops.id, { onDelete: "cascade" }),
  submittedUrl: text("submitted_url").notNull(),
  submittedHost: varchar("submitted_host", { length: 255 }).notNull(),
  submittedPath: text("submitted_path").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  submittedByWallet: text("submitted_by_wallet"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  usedForGeneration: boolean("used_for_generation").notNull().default(false),
  signalMetadataJson: jsonb("signal_metadata_json"),
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
  promptVersion: varchar("prompt_version", { length: 128 }).notNull(),
  modelVersion: varchar("model_version", { length: 128 }).notNull(),
  studyJson: jsonb("study_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const collections = pgTable("collections", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  relicCount: integer("relic_count").notNull(),
  ogImageId: varchar("og_image_id", { length: 64 }),
  generatorVersion: varchar("generator_version", { length: 64 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 128 }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const relicPlans = pgTable("relic_plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  promptVersion: varchar("prompt_version", { length: 128 }).notNull(),
  modelVersion: varchar("model_version", { length: 128 }).notNull(),
  planJson: jsonb("plan_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const relics = pgTable("relics", {
  id: varchar("id", { length: 64 }).primaryKey(),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
  relicIndex: integer("relic_index"),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: text("name").notNull(),
  archetype: text("archetype").notNull(),
  productFamily: text("product_family").notNull(),
  description: text("description").notNull(),
  whyThisExists: text("why_this_exists").notNull(),
  artDirection: text("art_direction").notNull(),
  printfulProductId: text("printful_product_id"),
  printfulVariantId: text("printful_variant_id"),
  fulfillmentSpecJson: jsonb("fulfillment_spec_json"),
  unitPriceUsd: varchar("unit_price_usd", { length: 32 }),
  priceBookId: varchar("price_book_id", { length: 64 }),
  priceLockedAt: timestamp("price_locked_at", { withTimezone: true }),
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
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "cascade" }),
  editionNumber: integer("edition_number").notNull(),
  globalEditionNumber: integer("global_edition_number"),
  status: varchar("status", { length: 32 }).notNull().default("available"),
  checkoutSessionId: varchar("checkout_session_id", { length: 64 }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  orderId: varchar("order_id", { length: 64 }),
  reservedAt: timestamp("reserved_at", { withTimezone: true }),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  buyerEmailHash: varchar("buyer_email_hash", { length: 128 }),
  printfulOrderId: text("printful_order_id"),
  onchainReceiptTxHash: text("onchain_receipt_tx_hash"),
  ...timestamps
}, (table) => ({
  relicEditionUnique: uniqueIndex("relic_editions_relic_number_unique").on(table.relicId, table.editionNumber),
  dropEditionUnique: uniqueIndex("relic_editions_drop_global_number_unique").on(table.dropId, table.globalEditionNumber)
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
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
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
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeRefundId: text("stripe_refund_id"),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id", { length: 64 }).notNull().references(() => collections.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).notNull().references(() => relics.id, { onDelete: "restrict" }),
  relicEditionId: varchar("relic_edition_id", { length: 64 }).notNull().references(() => relicEditions.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 32 }).notNull(),
  customerEmail: text("customer_email"),
  shippingJson: jsonb("shipping_json"),
  grossAmount: integer("gross_amount"),
  currency: varchar("currency", { length: 3 }).default("usd"),
  taxAmount: integer("tax_amount").default(0),
  shippingAmount: integer("shipping_amount").default(0),
  stripeFeeAmount: integer("stripe_fee_amount").default(0),
  printfulCostAmount: integer("printful_cost_amount").default(0),
  refundReserveAmount: integer("refund_reserve_amount").default(0),
  netMarginAmount: integer("net_margin_amount").default(0),
  creatorBountyAmount: integer("creator_bounty_amount").default(0),
  domainOwnerAmount: integer("domain_owner_amount").default(0),
  protocolFeeAmount: integer("protocol_fee_amount").default(0),
  printfulOrderId: text("printful_order_id"),
  printfulStatus: text("printful_status"),
  printfulDashboardUrl: text("printful_dashboard_url"),
  printfulTrackingUrl: text("printful_tracking_url"),
  printfulCostsJson: jsonb("printful_costs_json"),
  settlementStatus: varchar("settlement_status", { length: 32 }),
  economicsStatus: varchar("economics_status", { length: 32 }).notNull().default("estimated"),
  priceBookId: varchar("price_book_id", { length: 64 }),
  adminReviewRequired: boolean("admin_review_required").notNull().default(false),
  payoutBlockedAt: timestamp("payout_blocked_at", { withTimezone: true }),
  payoutBlockReason: text("payout_block_reason"),
  onchainReceiptTxHash: text("onchain_receipt_tx_hash"),
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

export const ledgerAccruals = pgTable("ledger_accruals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 }).notNull().references(() => drops.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  beneficiaryType: varchar("beneficiary_type", { length: 32 }).notNull(),
  beneficiaryWallet: text("beneficiary_wallet"),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  reason: text("reason").notNull(),
  txHash: text("tx_hash"),
  ...timestamps
}, (table) => ({
  ledgerAccrualUnique: uniqueIndex("ledger_accruals_order_beneficiary_unique").on(table.orderId, table.beneficiaryType)
}));

export const claims = pgTable("claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  storefrontId: varchar("storefront_id", { length: 64 }).notNull().references(() => storefronts.id, { onDelete: "cascade" }),
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "cascade" }),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  txtName: text("txt_name").notNull(),
  txtValue: text("txt_value").notNull(),
  claimantWallet: text("claimant_wallet"),
  claimantEmail: text("claimant_email"),
  claimantName: text("claimant_name"),
  proofJson: jsonb("proof_json"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const dropNotifications = pgTable("drop_notifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dropId: varchar("drop_id", { length: 64 }).notNull().references(() => drops.id, { onDelete: "cascade" }),
  relicId: varchar("relic_id", { length: 64 }).references(() => relics.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  source: varchar("source", { length: 32 }).notNull().default("preview_buy_modal"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json"),
  ...timestamps
});

export const scoutCheckoutSessions = pgTable("scout_checkout_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  submittedUrl: text("submitted_url").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  canonicalRootDomain: varchar("canonical_root_domain", { length: 255 }).notNull(),
  rootDomainHash: varchar("root_domain_hash", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  scoutUserId: varchar("scout_user_id", { length: 64 }).references(() => appUsers.id, { onDelete: "set null" }),
  scoutUsername: varchar("scout_username", { length: 64 }),
  summonerWallet: text("summoner_wallet"),
  creatorDisplayName: text("creator_display_name"),
  amountTotal: integer("amount_total"),
  currency: varchar("currency", { length: 8 }),
  status: varchar("status", { length: 32 }).notNull().default("created"),
  generationJobId: varchar("generation_job_id", { length: 64 }),
  dropId: varchar("drop_id", { length: 64 }).references(() => drops.id, { onDelete: "set null" }),
  error: text("error"),
  metadataJson: jsonb("metadata_json"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps
});

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: varchar("type", { length: 128 }).notNull(),
  livemode: boolean("livemode").notNull().default(false),
  stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  error: text("error"),
  metadataJson: jsonb("metadata_json"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  ...timestamps
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

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  ...timestamps
});

export const stripeTransfers = pgTable("stripe_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  ledgerAccrualId: varchar("ledger_accrual_id", { length: 64 }).references(() => ledgerAccruals.id, { onDelete: "set null" }),
  beneficiaryType: varchar("beneficiary_type", { length: 32 }).notNull(),
  stripeAccountId: text("stripe_account_id").notNull(),
  stripeTransferId: text("stripe_transfer_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  transferGroup: text("transfer_group").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  metadataJson: jsonb("metadata_json"),
  error: text("error"),
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
