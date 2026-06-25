import { beforeEach, describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { canonicalizeDropUrl } from "./dropCanonicalization";
import { parseDroplinkClaimValue, parseDroplinkPayoutValue, txtRecordNonceMatches, txtRecordPayoutMatches } from "./dnsClaim";
import { calculateWaterfall } from "./economics";
import { newId } from "./hashes";
import { openAIImageGenerationBody } from "./imageProvider";
import { buildDropPriceBook, priceBookRelicPriceCents } from "./pricing";
import { buildRelicFulfillmentSpec, choosePrintablePlacement } from "./printful";
import { withDefaultHttpsScheme } from "./urls";
import {
  attachStripeSession,
  completeCheckoutSale,
  getDropByCanonicalHash,
  publishStorefront,
  recordDropSourceSignal,
  reserveEditionForRelic,
  saveGeneratedBundle,
  startDnsClaim,
  startTempoPayout
} from "./store";
import type {
  AdminReview,
  Asset,
  Brand,
  BrandStudy,
  Collection,
  Drop,
  DropPriceBook,
  DropSourceSignal,
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
  process.env.DROPLINK_DATA_FILE = testStore;
  process.env.ALLOW_MOCKS = "false";
  process.env.AI_PROVIDER = "openai";
  process.env.IMAGE_PROVIDER = "openai";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.PRINTFUL_API_KEY = "pf_test";
  process.env.PRINTFUL_API_BASE = "https://api.printful.com";
  process.env.PRINTFUL_STORE_ID = "123";
  process.env.PRINTFUL_CONFIRM_ORDERS = "false";
  process.env.DROPLINK_SUMMON_PRICE_USDC = "8";
  process.env.DROPLINK_CREATOR_BOUNTY_BPS = "800";
  process.env.DROPLINK_PROTOCOL_FEE_BPS = "0";
  process.env.DROPLINK_TOTAL_SUPPLY = "24";
  process.env.DROPLINK_RELICS_PER_DROP = "3";
  process.env.DROPLINK_EDITIONS_PER_RELIC = "8";
  process.env.X402_ENABLED = "true";
  process.env.X402_NETWORK = "tempo";
  process.env.X402_ACCEPTED_ASSET = "USDC";
  process.env.X402_RECIPIENT_ADDRESS = "0xTreasury";
  process.env.X402_FACILITATOR_URL = "https://x402.test";
  process.env.DROPLINK_MIN_UNIT_MARGIN_USD = "12";
  process.env.DROPLINK_MIN_UNIT_PRICE_USD = "32";
  process.env.DROPLINK_MAX_UNIT_PRICE_USD = "188";
  await rm(testStore, { force: true });
});

describe("root-domain canonicalization", () => {
  test("subdomains resolve to the same canonical root domain", () => {
    expect(canonicalizeDropUrl("https://anky.app").canonicalRootDomain).toBe("anky.app");
    expect(canonicalizeDropUrl("https://mirror.anky.app/a").canonicalRootDomain).toBe("anky.app");
    expect(canonicalizeDropUrl("https://shop.anky.app").rootDomainHash).toBe(canonicalizeDropUrl("https://docs.anky.app").rootDomainHash);
  });

  test("bare domain input is normalized with https", () => {
    expect(withDefaultHttpsScheme("Theseptemberevent.com")).toBe("https://Theseptemberevent.com");
    expect(canonicalizeDropUrl("Theseptemberevent.com").sourceUrl).toBe("https://theseptemberevent.com/");
  });

  test("public suffix domains are parsed correctly", () => {
    const target = canonicalizeDropUrl("https://shop.example.co.uk/path?utm_source=x");
    expect(target.canonicalRootDomain).toBe("example.co.uk");
    expect(target.submittedHost).toBe("shop.example.co.uk");
    expect(target.sourceUrl).toBe("https://shop.example.co.uk/path");
  });

  test("duplicate subdomain summon identity returns existing root drop and records source signal", async () => {
    const bundle = await createBundle("claimed", "https://mirror.anky.app/start");
    const duplicate = canonicalizeDropUrl("https://shop.anky.app/buy");
    const existing = await getDropByCanonicalHash(duplicate.rootDomainHash);
    expect(existing?.id).toBe(bundle.drop?.id);
    await recordDropSourceSignal({
      dropId: bundle.drop!.id,
      submittedUrl: duplicate.originalSubmittedUrl,
      submittedHost: duplicate.submittedHost,
      submittedPath: duplicate.submittedPath,
      normalizedUrl: duplicate.sourceUrl,
      submittedByWallet: null,
      usedForGeneration: false,
      signalMetadataJson: { duplicateRootDomain: true }
    });
    const reloaded = await getDropByCanonicalHash(duplicate.rootDomainHash);
    expect(reloaded?.totalSupply).toBe(24);
  });
});

describe("OpenAI image request", () => {
  test("does not send removed response_format parameter", () => {
    const body = openAIImageGenerationBody("test product art");
    expect(body).not.toHaveProperty("response_format");
    expect(body.prompt).toBe("test product art");
  });
});

describe("Printful fulfillment metadata", () => {
  test("chooses a real product placement technique from Printful metadata", () => {
    const printable = choosePrintablePlacement({
      id: 12,
      name: "Unisex T-Shirt with sublimation mentioned elsewhere",
      type: "T-SHIRT",
      raw: {
        description: "mentions sublimation in unrelated text",
        placements: [
          { placement: "front", technique: "dtg", layers: [{ type: "file" }] },
          { placement: "front_large_dtf", technique: "dtfilm", layers: [{ type: "file" }] }
        ]
      }
    });
    expect(printable).toMatchObject({ placement: "front", technique: "dtg" });
  });

  test("uses selected catalog placement and technique instead of guessed sublimation", () => {
    const spec = buildRelicFulfillmentSpec({
      concept: {
        name: "Signal Tee",
        archetype: "shirt",
        productFamily: "tee",
        description: "Brand shirt",
        artDirection: "minimal",
        suggestedPriceCents: 4800
      },
      selection: {
        product: {
          id: 12,
          name: "Unisex T-Shirt",
          type: "T-SHIRT",
          raw: {
            placements: [
              { placement: "front", technique: "dtg", layers: [{ type: "file" }] },
              { placement: "front_large_dtf", technique: "dtfilm", layers: [{ type: "file" }] }
            ]
          }
        },
        variant: { id: 598, name: "Black / M", raw: {} },
        productType: "garment",
        placement: "front",
        technique: "dtg",
        selectionReason: "test"
      },
      printFileUrl: "https://assets.droplink.test/file.png",
      printFileSha256: "abc"
    });
    expect(spec.placement).toBe("front");
    expect(spec.technique).toBe("dtg");
  });
});

describe("walletless DNS claim", () => {
  test("claim/start does not require a wallet and uses root TXT", async () => {
    const bundle = await createBundle("summoned", "https://mirror.anky.app/start");
    const claim = await startDnsClaim(bundle.storefront.id, { claimantEmail: "owner@anky.app" });
    expect(claim.claimantWallet).toBeNull();
    expect(claim.txtName).toBe("_droplink.anky.app");
    expect(claim.txtValue).toBe("droplink-claim=nonce");
  });

  test("TXT without wallet verifies nonce parsing and missing nonce fails", () => {
    expect(parseDroplinkClaimValue("droplink-claim=abc123")).toEqual({ nonce: "abc123", wallet: undefined, contact: undefined });
    expect(txtRecordNonceMatches([["droplink-claim=abc123"]], "abc123")).toBe(true);
    expect(txtRecordNonceMatches([["droplink-claim=wrong"]], "abc123")).toBe(false);
  });
});

describe("payout setup", () => {
  test("payout status starts missing and Tempo setup requires DNS-verified domain", async () => {
    const summoned = await createBundle("summoned", "https://anky.app");
    expect(summoned.drop?.payoutStatus).toBe("missing");
    await expect(startTempoPayout(summoned.drop!.id, { walletAddress: "0x1111111111111111111111111111111111111111" })).rejects.toThrow("claimed");
  });

  test("Tempo payout uses a fresh DNS nonce and validates wallet format", async () => {
    const claimed = await createBundle("claimed", "https://docs.anky.app");
    await expect(startTempoPayout(claimed.drop!.id, { walletAddress: "not-wallet" })).rejects.toThrow("valid EVM");
    const result = await startTempoPayout(claimed.drop!.id, { walletAddress: "0x1111111111111111111111111111111111111111" });
    expect(result.txtName).toBe("_droplink-payout.anky.app");
    expect(parseDroplinkPayoutValue(result.txtValue)).toEqual({
      dropId: claimed.drop!.id,
      nonce: expect.any(String),
      wallet: "0x1111111111111111111111111111111111111111",
      chain: "tempo"
    });
    expect(txtRecordPayoutMatches([[result.txtValue]], {
      dropId: claimed.drop!.id,
      nonce: result.txtValue.match(/nonce=([^;]+)/)![1],
      wallet: "0x1111111111111111111111111111111111111111",
      chain: "tempo"
    })).toBe(true);
  });
});

describe("pricing and checkout", () => {
  test("generation fixture has a draft price book and 3 x 8 totals", async () => {
    const bundle = await createBundle("claimed", "https://anky.app");
    expect(bundle.drop?.priceBookJson?.status).toBe("draft");
    expect(bundle.drop?.priceBookJson?.relics).toHaveLength(3);
    expect(bundle.drop?.priceBookJson?.totals.maxSupply).toBe(24);
    expect(bundle.relics.every((relic) => relic.unitPriceUsd && relic.priceCents > 0)).toBe(true);
  });

  test("readiness/publish locks price book and checkout uses locked price", async () => {
    const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
    expect(bundle.drop?.priceBookJson?.status).toBe("locked");
    expect(bundle.drop?.priceBookLockedAt).toBeTruthy();
    const relic = bundle.relics[0];
    const lockedPrice = priceBookRelicPriceCents(bundle.drop?.priceBookJson, relic.id);
    const { checkout } = await reserveEditionForRelic({ relicId: relic.id, editionNumber: 1 });
    await attachStripeSession(checkout.id, "cs_locked");
    const sale = await completeCheckoutSale({ stripeSessionId: "cs_locked", stripePaymentIntentId: "pi_locked" });
    expect(sale.order.grossAmount).toBe(lockedPrice);
    expect(sale.order.priceBookId).toBe(bundle.drop?.id);
    expect(sale.order.economicsStatus).toBe("estimated");
  });

  test("checkout blocks if price book is unlocked", async () => {
    const bundle = await createBundle("claimed", "https://anky.app");
    await expect(reserveEditionForRelic({ relicId: bundle.relics[0].id })).rejects.toThrow("not available");
  });
});

describe("projected vs settled economics", () => {
  test("projected creator and owner proceeds are calculated from estimated net margin", async () => {
    const bundle = await createBundle("claimed", "https://anky.app");
    expect(Number(bundle.drop?.projectedEconomicsJson?.projectedCreatorBountyUsd)).toBeGreaterThan(0);
    expect(Number(bundle.drop?.projectedEconomicsJson?.projectedDomainOwnerProceedsUsd)).toBeGreaterThan(0);
  });

  test("settled waterfall subtracts costs and reserve before payouts", () => {
    const waterfall = calculateWaterfall({
      grossAmount: 10_000,
      currency: "usd",
      taxes: 800,
      shippingAmount: 1200,
      stripeFeeAmount: 350,
      printfulCostAmount: 3000,
      refundReserveAmount: 300,
      creatorBountyBps: 800,
      protocolFeeBps: 0
    });
    expect(waterfall.netMarginAmount).toBe(4350);
    expect(waterfall.creatorBountyAmount).toBe(348);
    expect(waterfall.domainOwnerAmount).toBe(4002);
  });

  test("negative margin creates zero payouts and admin review flag", () => {
    const waterfall = calculateWaterfall({
      grossAmount: 1000,
      currency: "usd",
      printfulCostAmount: 1200,
      creatorBountyBps: 800,
      protocolFeeBps: 0
    });
    expect(waterfall.creatorBountyAmount).toBe(0);
    expect(waterfall.domainOwnerAmount).toBe(0);
    expect(waterfall.adminReviewRequired).toBe(true);
  });
});

async function createBundle(status: "summoned" | "claimed", submittedUrl: string) {
  const now = new Date().toISOString();
  const target = canonicalizeDropUrl(submittedUrl);
  const brand: Brand = {
    id: newId("brand"),
    canonicalUrl: `https://${target.canonicalRootDomain}/`,
    hostname: target.canonicalRootDomain,
    slug: target.canonicalRootDomain.replaceAll(".", "-"),
    name: "Anky",
    createdAt: now,
    updatedAt: now
  };
  const storefront: Storefront = {
    id: newId("store"),
    brandId: brand.id,
    slug: brand.slug,
    status,
    claimStatus: status === "claimed" ? "verified" : "unclaimed",
    commerceMode: "preview",
    commissionBps: 0,
    customDomain: null,
    stripeConnectedAccountId: null,
    generationStatus: "READY_FOR_REVIEW",
    generationTraceId: "run_test",
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
  const dropId = `drop_${target.rootDomainHash.slice(0, 24)}`;
  const collection: Collection = {
    id: newId("col"),
    storefrontId: storefront.id,
    dropId,
    type: "drop",
    status: "ready_for_review",
    title: "Anky DropLink",
    subtitle: "3 relics · 8 editions each",
    relicCount: 3,
    ogImageId: null,
    generatorVersion: "test",
    promptVersion: "test",
    createdAt: now,
    publishedAt: null
  };
  const relics: Relic[] = Array.from({ length: 3 }, (_, index) => ({
    id: newId("relic"),
    collectionId: collection.id,
    dropId,
    relicIndex: index + 1,
    slug: `relic-${index + 1}`,
    name: `Relic ${index + 1}`,
    archetype: "signal",
    productFamily: "heavyweight tee",
    description: "A finite physical relic.",
    whyThisExists: "A domain was summoned and claimed.",
    artDirection: "Clean signal marks.",
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
      printFileSha256: `sha-${index + 1}`,
      retailPriceUsd: index === 2 ? "88.00" : "52.00",
      estimatedPrintfulCostUsd: "18.00",
      selectionReason: "test fixture"
    },
    unitPriceUsd: null,
    priceBookId: null,
    priceLockedAt: null,
    priceCents: 5200,
    currency: "usd",
    totalSupply: 8,
    soldCount: 0,
    reservedCount: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now
  }));
  const priceBook: DropPriceBook = buildDropPriceBook({ dropId, relics, generatedAt: now, generatedBy: "test", summonFeeUsd: "8" });
  for (const relic of relics) {
    const price = priceBook.relics.find((entry) => entry.relicId === relic.id)!;
    relic.unitPriceUsd = price.unitPriceUsd;
    relic.priceBookId = dropId;
    relic.priceCents = Math.round(Number(price.unitPriceUsd) * 100);
  }
  const drop: Drop = {
    id: dropId,
    storefrontId: storefront.id,
    originalSubmittedUrl: target.originalSubmittedUrl,
    submittedHost: target.submittedHost,
    submittedPath: target.submittedPath,
    sourceUrl: target.sourceUrl,
    canonicalUrl: target.canonicalUrl,
    canonicalDomain: target.canonicalRootDomain,
    canonicalRootDomain: target.canonicalRootDomain,
    registrableDomain: target.registrableDomain,
    rootDomainHash: target.rootDomainHash,
    domainHash: target.rootDomainHash,
    status,
    domainClaimStatus: status === "claimed" ? "verified" : "unclaimed",
    payoutStatus: "missing",
    payoutMethod: "none",
    publishStatus: "blocked",
    summonerWallet: "0x2222222222222222222222222222222222222222",
    creatorDisplayName: "Creator",
    summonPaymentTxHash: "0xSummon",
    summonPaymentMetadataJson: { valid: true },
    summonPriceUsdc: "8",
    creatorBountyBps: 800,
    protocolFeeBps: 0,
    totalSupply: 24,
    relicsPerDrop: 3,
    editionsPerRelic: 8,
    dnsClaimNonce: "nonce",
    dnsRecordName: `_droplink.${target.canonicalRootDomain}`,
    dnsRecordValue: "droplink-claim=nonce",
    domainOwnerName: null,
    domainOwnerWallet: null,
    domainOwnerEmail: status === "claimed" ? "owner@anky.app" : null,
    domainClaimProofJson: status === "claimed" ? { records: [["droplink-claim=nonce"]] } : null,
    domainClaimedAt: status === "claimed" ? now : null,
    tempoWalletAddress: null,
    tempoWalletVerifiedAt: null,
    tempoWalletVerificationProofJson: null,
    payoutNonce: null,
    payoutDnsRecordName: null,
    payoutDnsRecordValue: null,
    stripeConnectAccountId: null,
    stripeConnectStatus: null,
    stripeConnectOnboardingUrl: null,
    stripeConnectVerifiedAt: null,
    payoutConfiguredAt: null,
    priceBookJson: priceBook,
    projectedEconomicsJson: priceBook.totals,
    priceBookLockedAt: null,
    publishedAt: null,
    soldOutAt: null,
    archivedAt: null,
    readinessJson: null,
    createdAt: now,
    updatedAt: now
  };
  const editions: RelicEdition[] = relics.flatMap((relic) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: newId("ed"),
      dropId,
      relicId: relic.id,
      editionNumber: index + 1,
      globalEditionNumber: (Number(relic.relicIndex) - 1) * 8 + index + 1,
      status: "available" as const,
      checkoutSessionId: null,
      stripePaymentIntentId: null,
      orderId: null,
      reservedAt: null,
      reservedUntil: null,
      soldAt: null,
      buyerEmailHash: null,
      printfulOrderId: null,
      onchainReceiptTxHash: null,
      createdAt: now,
      updatedAt: now
    }))
  );
  const sourceSignals: DropSourceSignal[] = [
    {
      id: newId("sig"),
      dropId,
      submittedUrl: target.originalSubmittedUrl,
      submittedHost: target.submittedHost,
      submittedPath: target.submittedPath,
      normalizedUrl: target.sourceUrl,
      submittedByWallet: null,
      submittedAt: now,
      usedForGeneration: true,
      signalMetadataJson: {}
    }
  ];
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
    printfulTaskId: "task",
    viewName: "front",
    status: "ready",
    createdAt: now
  }));
  const ogImage: OgImage = {
    id: newId("og"),
    collectionId: collection.id,
    assetId: null,
    imageUrl: `https://cdn.droplink.test/og/${collection.id}.png`,
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
      archetype: "signal keeper",
      invocation:
        "Test Brand behaves like a precise signal keeper for this fixture. It turns a public link into a finite ritual that can be checked, reviewed, priced, and published without relying on private claims. The brand carries a compact visual language of marks, thresholds, and proof glyphs that make the drop feel connected without needing copied logos. It is calm, useful, and intentionally limited, with each artifact acting as one part of a small ceremony. One object belongs on the body, one behaves like a portable tool, and one witnesses the signal from a wall or feed. The invocation is long enough to exercise production code that expects a living brand interpretation, but it stays grounded in the test's simple signal vocabulary.",
      essence: "signal",
      worldview: "world",
      emotional_posture: "precise",
      visual_dna: {
        core_shapes: ["signal mark", "threshold frame"],
        material_feel: "matte ink on utilitarian cotton",
        composition_rules: ["center the proof mark", "leave clear negative space"],
        signature_gesture: "a small link-shaped threshold"
      },
      drop_narrative_seed: "A three-part proof of presence for a public signal.",
      aesthetic_motifs: ["signal", "ritual"],
      color_palette: ["#111", "#fff", "#f00"],
      language_style: "short",
      what_they_care_about: ["research", "tools"],
      what_they_bring_to_the_world: "signal",
      things_to_avoid: ["generic"],
      product_strategy_notes: "finite"
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
      drop_concept: "A cohesive proof-of-presence triptych.",
      drop_lore: "Three finite objects carry the same signal through body, tool, and witness.",
      relics: relics.map((relic) => ({
        name: relic.name,
        archetype: relic.archetype,
        role_in_triptych: `relic ${relic.relicIndex || 1} role`,
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
    type: "drop",
    status: "completed",
    currentStep: "READY_FOR_REVIEW",
    inputJson: {},
    error: null,
    createdAt: now,
    updatedAt: now
  };
  return saveGeneratedBundle({
    drop,
    brand,
    storefront,
    sourceSignals,
    snapshot: {
      id: newId("snap"),
      brandId: brand.id,
      url: target.sourceUrl,
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
}
