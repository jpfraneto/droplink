import { beforeEach, describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { brandSlugFromUrl, uniqueSlug } from "./slugs";
import { normalizePublicUrl } from "./urls";
import { txtRecordMatches } from "./dnsClaim";
import { commissionCents } from "./stripe";
import { newId } from "./hashes";
import {
  attachStripeSession,
  completeCheckoutSale,
  releaseCheckout,
  reserveEditionForRelic,
  saveGeneratedBundle,
  publishStorefront,
  tierRelicCount
} from "./store";
import type {
  AdminReview,
  Asset,
  Brand,
  BrandStudy,
  Collection,
  GenerationJob,
  Mockup,
  OgImage,
  Relic,
  RelicEdition,
  RelicPlan,
  Storefront
} from "./types";

const testStore = join(process.cwd(), "data", "test-store.json");

beforeEach(async () => {
  process.env.DATABASE_URL = "";
  process.env.ALLOW_MOCKS = "true";
  process.env.DROPLINK_DATA_FILE = testStore;
  await rm(testStore, { force: true });
});

describe("slug generation", () => {
  test("uses hostname without protocol, www, paths, queries, hashes, or dots", () => {
    expect(brandSlugFromUrl("https://anky.app")).toBe("ankyapp");
    expect(brandSlugFromUrl("https://fomo.family")).toBe("fomofamily");
    expect(brandSlugFromUrl("https://nousresearch.com")).toBe("nousresearchcom");
    expect(brandSlugFromUrl("https://shop.anky.app/path?x=1#hash")).toBe("shopankyapp");
  });

  test("uses numeric suffix on collisions", () => {
    expect(uniqueSlug("nousresearchcom", new Set(["nousresearchcom", "nousresearchcom-2"]))).toBe("nousresearchcom-3");
  });
});

describe("URL validation", () => {
  test("rejects local and unsafe URL inputs", async () => {
    await expect(normalizePublicUrl("file:///tmp/test")).rejects.toThrow("http and https");
    await expect(normalizePublicUrl("http://localhost:3000")).rejects.toThrow("Local or internal");
    await expect(normalizePublicUrl("http://127.0.0.1:3000")).rejects.toThrow("Private and local");
  });
});

describe("collection invariants", () => {
  test("free genesis is 3 relics and premium weekly is 8 relics", () => {
    expect(tierRelicCount("free", "genesis")).toBe(3);
    expect(tierRelicCount("atelier", "weekly")).toBe(8);
  });
});

describe("checkout and edition ledger", () => {
  test("creates exactly 8 editions and cannot reserve after sold out", async () => {
    const bundle = await createPublishedBundle(1);
    expect(bundle.editions).toHaveLength(8);
    const relicId = bundle.relics[0].id;
    const reserved = [];
    for (let index = 0; index < 8; index += 1) reserved.push(await reserveEditionForRelic({ relicId }));
    await expect(reserveEditionForRelic({ relicId })).rejects.toThrow("SOLD_OUT");
  });

  test("expired checkout releases the edition", async () => {
    const bundle = await createPublishedBundle(1);
    const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id });
    await releaseCheckout(checkout.id);
    const again = await reserveEditionForRelic({ relicId: bundle.relics[0].id });
    expect(again.edition.editionNumber).toBe(1);
  });

  test("successful webhook sale marks edition sold and writes 8 percent free commission", async () => {
    const bundle = await createPublishedBundle(1);
    const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id });
    await attachStripeSession(checkout.id, "cs_test_123");
    const sale = await completeCheckoutSale({
      stripeSessionId: "cs_test_123",
      stripePaymentIntentId: "pi_test",
      customerEmail: "buyer@example.com"
    });
    expect(sale.bundle.editions.find((edition) => edition.id === sale.order.relicEditionId)?.status).toBe("sold");
    expect(sale.ledger.find((entry) => entry.type === "droplink_commission")?.amountCents).toBe(416);
  });

  test("premium commission is zero", () => {
    expect(commissionCents(8800, 0)).toBe(0);
    expect(commissionCents(5200, 800)).toBe(416);
  });
});

describe("DNS claim parsing", () => {
  test("matches split TXT records", () => {
    expect(txtRecordMatches([["droplink-verify=", "abc123"]], "droplink-verify=abc123")).toBe(true);
    expect(txtRecordMatches([["other=value"]], "droplink-verify=abc123")).toBe(false);
  });
});

async function createPublishedBundle(relicCount: 1 | 3 | 8) {
  const now = new Date().toISOString();
  const brand: Brand = {
    id: newId("brand"),
    canonicalUrl: "https://nousresearch.com/",
    hostname: "nousresearch.com",
    slug: `nousresearchcom-${relicCount}`,
    name: "Nous Research",
    createdAt: now,
    updatedAt: now
  };
  const storefront: Storefront = {
    id: newId("store"),
    brandId: brand.id,
    slug: brand.slug,
    status: "ready_for_review",
    tier: "free",
    claimStatus: "unclaimed",
    commerceMode: "preview",
    commissionBps: 800,
    customDomain: null,
    stripeConnectedAccountId: null,
    generationStatus: "READY_FOR_REVIEW",
    generationTraceId: "run_test",
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
  const collection: Collection = {
    id: newId("col"),
    storefrontId: storefront.id,
    type: "genesis",
    status: "ready_for_review",
    title: "Nous Genesis Relics",
    subtitle: "3 limited relics · 8 units each",
    relicCount,
    ogImageId: null,
    generatorVersion: "test",
    promptVersion: "test",
    createdAt: now,
    publishedAt: null
  };
  const relics: Relic[] = Array.from({ length: relicCount }, (_, index) => ({
    id: newId("relic"),
    collectionId: collection.id,
    slug: `relic-${index + 1}`,
    name: `Relic ${index + 1}`,
    archetype: "body",
    productFamily: "premium tee",
    description: "A limited relic.",
    whyThisExists: "Because the brand brought signal.",
    artDirection: "Signal marks.",
    printfulProductId: "71",
    printfulVariantId: "4012",
    fulfillmentSpecJson: {
      provider: "printful",
      catalogProductId: 71,
      catalogVariantId: 4012,
      productType: "garment",
      productName: "Test shirt",
      variantName: "Black / M",
      placement: "front",
      technique: "dtg",
      printFileUrl: `https://cdn.droplink.test/print-files/${index + 1}.png`,
      printFileSha256: "test-sha",
      retailPriceUsd: "52.00",
      selectionReason: "test fixture"
    },
    priceCents: 5200,
    currency: "usd",
    totalSupply: 8,
    soldCount: 0,
    reservedCount: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now
  }));
  const editions: RelicEdition[] = relics.flatMap((relic) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: newId("ed"),
      relicId: relic.id,
      editionNumber: index + 1,
      status: "available" as const,
      checkoutSessionId: null,
      orderId: null,
      reservedUntil: null,
      soldAt: null,
      createdAt: now,
      updatedAt: now
    }))
  );
  const assets: Asset[] = relics.flatMap((relic) => [
    {
      id: newId("asset"),
      collectionId: collection.id,
      relicId: relic.id,
      type: "print_file" as const,
      url: `https://assets.droplink.test/print-files/${relic.id}.png`,
      storageProvider: "r2",
      width: 900,
      height: 900,
      checksum: "test",
      prompt: "test",
      validationStatus: "valid" as const,
      metadataJson: { storageKey: `print-files/${relic.id}.png` },
      createdAt: now
    },
    {
      id: newId("asset"),
      collectionId: collection.id,
      relicId: relic.id,
      type: "preview" as const,
      url: `https://assets.droplink.test/previews/${relic.id}.webp`,
      storageProvider: "r2",
      width: 900,
      height: 900,
      checksum: "test-webp",
      prompt: "test",
      validationStatus: "valid" as const,
      metadataJson: { storageKey: `previews/${relic.id}.webp` },
      createdAt: now
    }
  ]);
  const mockups: Mockup[] = relics.map((relic) => ({
    id: newId("mock"),
    relicId: relic.id,
    assetId: assets.find((asset) => asset.relicId === relic.id)?.id || null,
    imageUrl: `https://cdn.droplink.test/mockups/${relic.id}.png`,
    printfulTaskId: null,
    viewName: "front",
    status: "ready",
    createdAt: now
  }));
  const ogImage: OgImage = {
    id: newId("og"),
    collectionId: collection.id,
    assetId: null,
    imageUrl: `/api/og/${collection.id}.png`,
    title: collection.title,
    subtitle: collection.subtitle,
    prompt: "test",
    compositionJson: {},
    status: "ready",
    createdAt: now
  };
  const study: BrandStudy = {
    id: newId("study"),
    brandId: brand.id,
    storefrontId: storefront.id,
    promptVersion: "test",
    modelVersion: "test",
    studyJson: {
      brand_name: brand.name,
      domain: brand.hostname,
      essence: "signal",
      worldview: "world",
      emotional_posture: "precise",
      aesthetic_motifs: ["signal", "ritual"],
      color_palette: ["#111", "#fff", "#f00"],
      language_style: "short",
      what_they_care_about: ["research", "tools"],
      what_they_bring_to_the_world: "signal",
      things_to_avoid: ["generic"],
      product_strategy_notes: "limited"
    },
    createdAt: now
  };
  const relicPlan: RelicPlan = {
    id: newId("plan"),
    collectionId: collection.id,
    promptVersion: "test",
    modelVersion: "test",
    planJson: {
      collection_title: collection.title,
      collection_subtitle: collection.subtitle,
      relics: relics.map((relic) => ({
        name: relic.name,
        archetype: relic.archetype,
        physical_archetype: "garment",
        product_family: relic.productFamily,
        description: relic.description,
        why_this_exists: relic.whyThisExists,
        art_direction: relic.artDirection,
        suggested_price_cents: relic.priceCents,
        printful_product_key: relic.productFamily
      }))
    },
    createdAt: now
  };
  const adminReview: AdminReview = {
    id: newId("review"),
    storefrontId: storefront.id,
    collectionId: collection.id,
    status: "pending",
    checklistJson: {},
    notes: null,
    createdAt: now,
    updatedAt: now
  };
  const job: GenerationJob = {
    id: newId("job"),
    storefrontId: storefront.id,
    collectionId: collection.id,
    traceId: "run_test",
    type: "genesis",
    status: "completed",
    currentStep: "READY_FOR_REVIEW",
    inputJson: {},
    error: null,
    createdAt: now,
    updatedAt: now
  };
  await saveGeneratedBundle({
    brand,
    storefront,
    snapshot: {
      id: newId("snap"),
      brandId: brand.id,
      url: brand.canonicalUrl,
      title: brand.name,
      description: "test",
      textSample: "test",
      createdAt: now
    },
    study,
    collection,
    relicPlan,
    relics,
    editions,
    assets,
    mockups,
    ogImage,
    adminReview,
    job
  });
  return publishStorefront(storefront.id);
}
