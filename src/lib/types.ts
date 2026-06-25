export type DropStatus = "summoned" | "claimed" | "published" | "sold_out" | "archived";
export type StorefrontStatus = "summoned" | "claimed" | "ready_for_review" | "published" | "sold_out" | "archived";
export type ClaimStatus = "unclaimed" | "pending_dns" | "verified";
export type CommerceMode = "preview" | "platform_checkout";

export type CollectionType = "drop";
export type CollectionStatus = "draft" | "generating" | "ready_for_review" | "published" | "failed" | "archived";
export type RelicStatus = "draft" | "live" | "sold_out" | "failed";
export type EditionStatus = "available" | "reserved" | "sold" | "fulfilled" | "refunded" | "canceled";
export type CheckoutStatus = "created" | "completed" | "expired" | "failed";
export type DomainClaimStatus = "unclaimed" | "verified";
export type PayoutStatus = "missing" | "tempo_wallet_ready" | "stripe_connect_ready";
export type PayoutMethod = "none" | "tempo_wallet" | "stripe_connect";
export type PublishStatus = "blocked" | "ready" | "published";
export type EconomicsStatus = "estimated" | "settled" | "adjusted" | "disputed";
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
  | "creator_bounty"
  | "domain_owner_proceeds"
  | "protocol_fee"
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
  | "AWAITING_MANUAL_IMAGES"
  | "READY_FOR_REVIEW"
  | "PUBLISHED"
  | "FAILED";

export type Drop = {
  id: string;
  storefrontId: string;
  originalSubmittedUrl: string;
  submittedHost?: string | null;
  submittedPath?: string | null;
  sourceUrl?: string | null;
  canonicalUrl: string;
  canonicalDomain: string;
  canonicalRootDomain?: string | null;
  registrableDomain?: string | null;
  rootDomainHash?: string | null;
  domainHash: string;
  status: DropStatus;
  domainClaimStatus?: DomainClaimStatus | null;
  payoutStatus?: PayoutStatus | null;
  payoutMethod?: PayoutMethod | null;
  publishStatus?: PublishStatus | null;
  summonerWallet?: string | null;
  creatorDisplayName?: string | null;
  summonPaymentTxHash?: string | null;
  summonPaymentMetadataJson?: Record<string, unknown> | null;
  summonPriceUsdc: string;
  creatorBountyBps: number;
  protocolFeeBps: number;
  totalSupply: number;
  relicsPerDrop: number;
  editionsPerRelic: number;
  dnsClaimNonce?: string | null;
  dnsRecordName?: string | null;
  dnsRecordValue?: string | null;
  domainOwnerName?: string | null;
  domainOwnerWallet?: string | null;
  domainOwnerEmail?: string | null;
  domainClaimProofJson?: Record<string, unknown> | null;
  domainClaimedAt?: string | null;
  tempoWalletAddress?: string | null;
  tempoWalletVerifiedAt?: string | null;
  tempoWalletVerificationProofJson?: Record<string, unknown> | null;
  payoutNonce?: string | null;
  payoutDnsRecordName?: string | null;
  payoutDnsRecordValue?: string | null;
  stripeConnectAccountId?: string | null;
  stripeConnectStatus?: string | null;
  stripeConnectOnboardingUrl?: string | null;
  stripeConnectVerifiedAt?: string | null;
  payoutConfiguredAt?: string | null;
  priceBookJson?: DropPriceBook | null;
  projectedEconomicsJson?: DropProjectedEconomics | null;
  priceBookLockedAt?: string | null;
  publishedAt?: string | null;
  soldOutAt?: string | null;
  archivedAt?: string | null;
  readinessJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type DropSourceSignal = {
  id: string;
  dropId: string;
  submittedUrl: string;
  submittedHost: string;
  submittedPath: string;
  normalizedUrl: string;
  submittedByWallet?: string | null;
  submittedAt: string;
  usedForGeneration: boolean;
  signalMetadataJson?: Record<string, unknown> | null;
};

export type DropPriceBook = {
  currency: "USD" | "USDC";
  status: "draft" | "locked";
  generatedAt: string;
  lockedAt?: string;
  pricingPolicy: {
    minUnitMarginUsd: string;
    safetyBufferBps: number;
    refundReserveBps: number;
    creatorBountyBps: number;
    protocolFeeBps: number;
    minUnitPriceUsd: string;
    maxUnitPriceUsd: string;
  };
  relics: Array<{
    relicId: string;
    relicIndex: number;
    relicName: string;
    editionCount: 8;
    unitPriceUsd: string;
    estimatedUnitPrintfulCostUsd: string;
    estimatedUnitPaymentFeeUsd: string;
    estimatedUnitRefundReserveUsd: string;
    estimatedUnitGrossMarginUsd: string;
    estimatedUnitNetMarginUsd: string;
    projectedCreatorBountyPerUnitUsd: string;
    projectedDomainOwnerProceedsPerUnitUsd: string;
    projectedProtocolFeePerUnitUsd: string;
    pricingReason: string;
  }>;
  totals: DropProjectedEconomics;
};

export type DropProjectedEconomics = {
  maxSupply: 24;
  maxGrossRevenueUsd: string;
  estimatedTotalPrintfulCostUsd: string;
  estimatedTotalPaymentFeesUsd: string;
  estimatedTotalRefundReserveUsd: string;
  estimatedTotalNetMarginUsd: string;
  projectedCreatorBountyUsd: string;
  projectedDomainOwnerProceedsUsd: string;
  projectedProtocolFeeUsd: string;
  summonFeeUsd: string;
};

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
  dropId?: string | null;
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
  dropId?: string | null;
  relicIndex?: number | null;
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
  unitPriceUsd?: string | null;
  priceBookId?: string | null;
  priceLockedAt?: string | null;
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
  dropId?: string | null;
  relicId: string;
  editionNumber: number;
  globalEditionNumber?: number | null;
  status: EditionStatus;
  checkoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  orderId?: string | null;
  reservedUntil?: string | null;
  reservedAt?: string | null;
  soldAt?: string | null;
  buyerEmailHash?: string | null;
  printfulOrderId?: string | null;
  onchainReceiptTxHash?: string | null;
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
  dropId?: string | null;
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
  dropId?: string | null;
  stripePaymentIntentId?: string | null;
  storefrontId: string;
  collectionId: string;
  relicId: string;
  relicEditionId: string;
  status: OrderStatus;
  customerEmail?: string | null;
  shippingJson?: Record<string, unknown> | null;
  grossAmount?: number | null;
  currency?: string | null;
  taxAmount?: number | null;
  shippingAmount?: number | null;
  stripeFeeAmount?: number | null;
  printfulCostAmount?: number | null;
  refundReserveAmount?: number | null;
  netMarginAmount?: number | null;
  creatorBountyAmount?: number | null;
  domainOwnerAmount?: number | null;
  protocolFeeAmount?: number | null;
  printfulOrderId?: string | null;
  printfulStatus?: string | null;
  printfulDashboardUrl?: string | null;
  printfulTrackingUrl?: string | null;
  printfulCostsJson?: Record<string, unknown> | null;
  settlementStatus?: string | null;
  economicsStatus?: EconomicsStatus | null;
  priceBookId?: string | null;
  adminReviewRequired?: boolean | null;
  onchainReceiptTxHash?: string | null;
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
  dropId?: string | null;
  hostname: string;
  txtName: string;
  txtValue: string;
  claimantWallet?: string | null;
  claimantEmail?: string | null;
  claimantName?: string | null;
  proofJson?: Record<string, unknown> | null;
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

export type LedgerAccrual = {
  id: string;
  dropId: string;
  orderId: string;
  beneficiaryType: "creator" | "domain_owner" | "protocol";
  beneficiaryWallet?: string | null;
  amount: number;
  currency: string;
  status: "pending" | "claimable" | "paid" | "reversed";
  reason: string;
  txHash?: string | null;
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
  type: "drop";
  status: "queued" | "running" | "completed" | "failed";
  currentStep: GenerationStep;
  inputJson: Record<string, unknown>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StorefrontBundle = {
  drop: Drop | null;
  sourceSignals: DropSourceSignal[];
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
  orders: Order[];
  ledgerAccruals: LedgerAccrual[];
  events: SystemEvent[];
};

export type StoreData = {
  drops: Drop[];
  dropSourceSignals: DropSourceSignal[];
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
  ledgerAccruals: LedgerAccrual[];
  adminReviews: AdminReview[];
  generationJobs: GenerationJob[];
  systemEvents: SystemEvent[];
};
