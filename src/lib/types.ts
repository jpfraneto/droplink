export type DropStatus = "generating" | "preview" | "claimed" | "live" | "failed";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type JobType = "from_url" | "from_capsule";

export type Product = {
  id: string;
  dropId: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  whyThisProduct: string;
  priceCents: number;
  currency: string;
  imagePrompt: string;
  imageUrl: string;
  mockupUrl: string;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  position: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
};

export type DropReceipt = {
  source: string;
  collection: string;
  whatDropLinkSaw: string;
  brandSummary: string;
  audience: string;
  whyTheseProducts: string;
  pricingLogic: string;
  status: string;
  platformFee: string;
  generatedAt: string;
};

export type Drop = {
  id: string;
  slug: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  sourceDescription: string;
  brandName: string;
  brandSummary: string;
  audience: string;
  collectionName: string;
  collectionTagline: string;
  status: DropStatus;
  isClaimed: boolean;
  ownerEmail?: string | null;
  stripeConnectedAccountId?: string | null;
  platformFeeBps: number;
  receiptJson: DropReceipt;
  receiptHash: string;
  capsuleJson?: DropCapsule | null;
  capsuleHash?: string | null;
  ogImageUrl: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};

export type GenerationJob = {
  id: string;
  type: JobType;
  status: JobStatus;
  inputJson: unknown;
  logsJson: string[];
  error?: string | null;
  dropId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  dropId: string;
  productId?: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string | null;
  amountSubtotalCents: number;
  amountTotalCents: number;
  platformFeeCents: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "failed";
  customerEmail?: string | null;
  fulfillmentStatus: "none" | "pending" | "fulfilled" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type DropCapsuleProduct = {
  name: string;
  type: string;
  description: string;
  why_this_product: string;
  price_cents: number;
  currency: string;
  image_prompt: string;
};

export type DropCapsule = {
  protocol: "droplink.drop_capsule";
  version: string;
  source: {
    type: "url" | "agent" | "manual";
    url?: string;
    domain?: string;
    title?: string;
  };
  project: {
    name: string;
    one_liner: string;
    brand_summary: string;
    audience: string;
    voice: string[];
    forbidden_vibes: string[];
  };
  drop: {
    collection_name: string;
    collection_tagline: string;
    visual_direction: string;
    products: [DropCapsuleProduct, DropCapsuleProduct, DropCapsuleProduct];
  };
  commerce: {
    platform_fee_bps: number;
    requires_claim_for_live_sales: boolean;
  };
  approval: {
    status: "preview" | "claimed" | "live";
    approved_by: string | null;
  };
};

export type StoreData = {
  drops: Drop[];
  products: Product[];
  jobs: GenerationJob[];
  orders: Order[];
};
