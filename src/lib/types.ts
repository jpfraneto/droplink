export type StorefrontStatus = "draft" | "ready_for_review" | "published" | "archived";
export type StorefrontTier = "free" | "atelier";
export type ClaimStatus = "unclaimed" | "pending_dns" | "verified";
export type CommerceMode = "preview" | "platform_checkout" | "connect_checkout";

export type CollectionType = "genesis" | "weekly" | "custom";
export type CollectionStatus = "draft" | "generating" | "ready_for_review" | "published" | "failed" | "archived";
export type RelicStatus = "draft" | "live" | "sold_out" | "failed";
export type EditionStatus = "available" | "reserved" | "sold" | "expired";
export type CheckoutStatus = "created" | "completed" | "expired" | "failed";
export type OrderStatus =
  | "paid"
  | "fulfillment_pending"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "refunded"
  | "failed";
export type LedgerEntryType =
  | "customer_payment"
  | "stripe_fee"
  | "printful_cost"
  | "printful_shipping"
  | "tax"
  | "droplink_commission"
  | "brand_payable"
  | "refund"
  | "adjustment";

export type GenerationStep =
  | "INTAKE_CREATED"
  | "CRAWLING"
  | "CRAWLED"
  | "DISTILLING"
  | "DISTILLED"
  | "PLANNING_RELICS"
  | "RELICS_PLANNED"
  | "MATCHING_PRINTFUL"
  | "PRINTFUL_MATCHED"
  | "GENERATING_PRINT_FILES"
  | "PRINT_FILES_READY"
  | "VALIDATING_PRINT_FILES"
  | "PRINT_FILES_VALID"
  | "GENERATING_MOCKUPS"
  | "MOCKUPS_READY"
  | "GENERATING_OG"
  | "OG_READY"
  | "READY_FOR_REVIEW"
  | "PUBLISHED"
  | "FAILED";

export type Brand = {
  id: string;
  canonicalUrl: string;
  hostname: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Storefront = {
  id: string;
  brandId: string;
  slug: string;
  status: StorefrontStatus;
  tier: StorefrontTier;
  claimStatus: ClaimStatus;
  commerceMode: CommerceMode;
  commissionBps: number;
  customDomain?: string | null;
  stripeConnectedAccountId?: string | null;
  generationStatus: GenerationStep;
  generationTraceId?: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};

export type BrandSnapshot = {
  id: string;
  brandId: string;
  url: string;
  title: string;
  description: string;
  textSample: string;
  createdAt: string;
};

export type BrandStudyJson = {
  brand_name: string;
  domain: string;
  essence: string;
  worldview: string;
  emotional_posture: string;
  aesthetic_motifs: string[];
  color_palette: string[];
  language_style: string;
  what_they_care_about: string[];
  what_they_bring_to_the_world: string;
  things_to_avoid: string[];
  product_strategy_notes: string;
};

export type BrandStudy = {
  id: string;
  brandId: string;
  storefrontId: string;
  promptVersion: string;
  modelVersion: string;
  studyJson: BrandStudyJson;
  createdAt: string;
};

export type RelicPlanJson = {
  collection_title: string;
  collection_subtitle: string;
  relics: Array<{
    name: string;
    archetype: string;
    physical_archetype?: "garment" | "poster" | "tote" | "sticker" | "hat" | "print" | "other";
    product_family: string;
    description: string;
    why_this_exists: string;
    art_direction: string;
    suggested_price_cents: number;
    printful_product_key: string;
  }>;
};

export type RelicFulfillmentSpec = {
  provider: "printful";
  catalogProductId: number;
  catalogVariantId: number;
  productType: string;
  productName: string;
  variantName: string;
  placement: string;
  technique: string;
  printFileUrl: string;
  printFileSha256: string;
  mockupTaskId?: string;
  mockupUrls?: string[];
  retailPriceUsd: string;
  estimatedPrintfulCostUsd?: string;
  selectionReason: string;
  rawPrintfulCatalogSnapshotJson?: unknown;
};

export type RelicPlan = {
  id: string;
  collectionId: string;
  promptVersion: string;
  modelVersion: string;
  planJson: RelicPlanJson;
  createdAt: string;
};

export type Collection = {
  id: string;
  storefrontId: string;
  type: CollectionType;
  status: CollectionStatus;
  title: string;
  subtitle: string;
  relicCount: number;
  ogImageId?: string | null;
  generatorVersion: string;
  promptVersion: string;
  createdAt: string;
  publishedAt?: string | null;
};

export type Relic = {
  id: string;
  collectionId: string;
  slug: string;
  name: string;
  archetype: string;
  productFamily: string;
  description: string;
  whyThisExists: string;
  artDirection: string;
  printfulProductId?: string | null;
  printfulVariantId?: string | null;
  fulfillmentSpecJson?: RelicFulfillmentSpec | null;
  priceCents: number;
  currency: string;
  totalSupply: number;
  soldCount: number;
  reservedCount: number;
  status: RelicStatus;
  createdAt: string;
  updatedAt: string;
};

export type RelicEdition = {
  id: string;
  relicId: string;
  editionNumber: number;
  status: EditionStatus;
  checkoutSessionId?: string | null;
  orderId?: string | null;
  reservedUntil?: string | null;
  soldAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  collectionId?: string | null;
  relicId?: string | null;
  type: "source_image" | "print_file" | "preview" | "og" | "mockup" | "other";
  url: string;
  storageProvider: string;
  width?: number | null;
  height?: number | null;
  checksum?: string | null;
  prompt?: string | null;
  validationStatus: "pending" | "valid" | "invalid" | "mock";
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
};

export type Mockup = {
  id: string;
  relicId: string;
  assetId?: string | null;
  imageUrl: string;
  printfulTaskId?: string | null;
  viewName: string;
  status: string;
  createdAt: string;
};

export type OgImage = {
  id: string;
  collectionId: string;
  assetId?: string | null;
  imageUrl: string;
  title: string;
  subtitle: string;
  prompt: string;
  compositionJson?: Record<string, unknown> | null;
  status: string;
  createdAt: string;
};

export type CheckoutSession = {
  id: string;
  stripeSessionId: string;
  storefrontId: string;
  collectionId: string;
  relicId: string;
  relicEditionId: string;
  status: CheckoutStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  checkoutSessionId: string;
  stripePaymentIntentId?: string | null;
  storefrontId: string;
  collectionId: string;
  relicId: string;
  relicEditionId: string;
  status: OrderStatus;
  customerEmail?: string | null;
  shippingJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerEntry = {
  id: string;
  orderId: string;
  type: LedgerEntryType;
  amountCents: number;
  currency: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
};

export type Claim = {
  id: string;
  storefrontId: string;
  hostname: string;
  txtName: string;
  txtValue: string;
  status: "pending" | "verified" | "failed" | "expired";
  verifiedAt?: string | null;
  createdAt: string;
};

export type FulfillmentOrder = {
  id: string;
  orderId: string;
  provider: "printful";
  providerOrderId?: string | null;
  providerExternalId?: string | null;
  status: "draft_created" | "confirmed" | "shipped" | "delivered" | "failed";
  requestJson?: Record<string, unknown> | null;
  responseJson?: Record<string, unknown> | null;
  dashboardUrl?: string | null;
  trackingUrl?: string | null;
  costsJson?: Record<string, unknown> | null;
  webhookEventsJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SystemEvent = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadataJson?: Record<string, unknown> | null;
  requestId?: string | null;
  traceId?: string | null;
  createdAt: string;
};

export type Subscription = {
  id: string;
  storefrontId: string;
  stripeSubscriptionId?: string | null;
  status: string;
  priceCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type StripeAccount = {
  id: string;
  storefrontId: string;
  stripeAccountId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminReview = {
  id: string;
  storefrontId: string;
  collectionId?: string | null;
  status: "pending" | "approved" | "rejected";
  checklistJson: Record<string, boolean | string>;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationJob = {
  id: string;
  storefrontId?: string | null;
  collectionId?: string | null;
  traceId: string;
  type: "genesis" | "weekly";
  status: "queued" | "running" | "completed" | "failed";
  currentStep: GenerationStep;
  inputJson: Record<string, unknown>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StorefrontBundle = {
  brand: Brand;
  storefront: Storefront;
  collections: Collection[];
  activeCollection: Collection | null;
  relics: Relic[];
  editions: RelicEdition[];
  assets: Asset[];
  mockups: Mockup[];
  ogImage: OgImage | null;
  brandStudy: BrandStudy | null;
  relicPlan: RelicPlan | null;
  events: SystemEvent[];
};

export type StoreData = {
  brands: Brand[];
  storefronts: Storefront[];
  collections: Collection[];
  relics: Relic[];
  relicEditions: RelicEdition[];
  assets: Asset[];
  mockups: Mockup[];
  ogImages: OgImage[];
  brandSnapshots: BrandSnapshot[];
  brandStudies: BrandStudy[];
  relicPlans: RelicPlan[];
  claims: Claim[];
  checkoutSessions: CheckoutSession[];
  orders: Order[];
  ledgerEntries: LedgerEntry[];
  fulfillmentOrders: FulfillmentOrder[];
  stripeAccounts: StripeAccount[];
  subscriptions: Subscription[];
  adminReviews: AdminReview[];
  generationJobs: GenerationJob[];
  systemEvents: SystemEvent[];
};
