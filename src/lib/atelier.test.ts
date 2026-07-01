import { beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { POST as printfulWebhookPOST } from "../app/api/printful/webhook/route";
import { POST as adminPrintfulRetryPOST } from "../app/api/admin/orders/[id]/printful/retry/route";
import { bestVisualReferences, buildBrandDiscoveryDossier } from "./brandDiscovery";
import { canonicalizeDropUrl } from "./dropCanonicalization";
import { parseDroplinkClaimValue, parseDroplinkPayoutValue, txtRecordNonceMatches, txtRecordPayoutMatches } from "./dnsClaim";
import { calculateWaterfall } from "./economics";
import { __setFulfillmentTestHooks, confirmExistingPrintfulOrder, ensurePrintfulDraftForOrder } from "./fulfillment";
import { newId } from "./hashes";
import { openAIImageGenerationBody } from "./imageProvider";
import { buildDropPriceBook, priceBookRelicPriceCents } from "./pricing";
import { validateProducts } from "./productValidation";
import { buildRelicFulfillmentSpec, choosePrintablePlacement } from "./printful";
import { withDefaultHttpsScheme } from "./urls";
import {
  attachStripeSession,
  beginStripeEventProcessing,
  completeCheckoutSale,
  createScoutCheckoutSessionRecord,
  expireStaleCheckoutReservations,
  getActiveScoutCheckoutByRootDomainHash,
  getDropByCanonicalHash,
  getOrderBundle,
  getScoutCheckoutSessionByStripeSessionId,
  markOrderPaymentFailed,
  markOrderRefundedOrDisputed,
  markStripeEventProcessed,
  publishStorefront,
  recordDropSourceSignal,
  reviewReadiness,
  reserveEditionForRelic,
  saveGeneratedBundle,
  sendOrderReceiptEmail,
  startDnsClaim,
  startTempoPayout,
  updateScoutCheckoutSessionRecord,
  withScoutRootDomainLock,
  verifyCheckoutSessionMatchesReservation
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
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  delete process.env.DROPLINK_PRODUCTION_GUARDS;
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
  process.env.PRINTFUL_AUTO_CONFIRM_ORDERS = "false";
  process.env.PRINTFUL_WEBHOOK_SECRET = "pf_webhook_secret";
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
  process.env.DROPLINK_REQUIRE_GENERATION_KEY = "false";
  __setFulfillmentTestHooks();
  globalThis.fetch = originalFetch;
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

describe("brand discovery dossier", () => {
  test("keeps brand-neighborhood links and filters weak favicon references", () => {
    const dossier = buildBrandDiscoveryDossier({
      canonicalRootDomain: "example.com",
      page: {
        url: "https://example.com/",
        finalUrl: "https://example.com/",
        domain: "example.com",
        title: "Example",
        description: "Example creates useful tools for useful people.",
        ogImage: "https://example.com/og.png",
        favicon: "https://example.com/favicon.ico",
        headings: ["Useful tools", "Useful people"],
        discoveredLinks: [
          { url: "https://x.com/example", label: "X", kind: "social" },
          { url: "https://github.com/example", label: "GitHub", kind: "social" },
          { url: "https://example.com/blog", label: "Blog", kind: "blog" }
        ],
        visualEvidence: [
          {
            url: "https://example.com/favicon.ico",
            sourcePage: "https://example.com/",
            kind: "favicon",
            width: 32,
            height: 32,
            score: 5,
            reason: "tiny favicon"
          },
          {
            url: "https://example.com/launch-card.png",
            sourcePage: "https://example.com/",
            kind: "article_cover",
            width: 1200,
            height: 630,
            score: 89,
            reason: "launch card"
          }
        ],
        textSample: "Example creates useful tools for useful people. Useful tools make useful people faster."
      }
    });
    expect(dossier.discoveredLinks[0].kind).toBe("social");
    expect(dossier.textSignals.repeatedPhrases).toContain("useful tools");
    expect(bestVisualReferences(dossier).map((entry) => entry.url)).toEqual(["https://example.com/launch-card.png"]);
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
        productCategory: "tee",
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

describe("concept-vessel validation", () => {
  test("notebook concept on tee creates a blocking error", () => {
    const result = validateProducts(validationFixture({ name: "The Archive Notebook", description: "A spiral notebook with pages.", vessel: "Youth Classic Tee", slot: "WEAR" }));
    expect(result.blocking_errors.map((entry) => entry.code)).toContain("notebook_on_apparel");
  });

  test("hoodie concept on candle creates a blocking error", () => {
    const result = validateProducts(validationFixture({ name: "Signal Hoodie", description: "A wearable hoodie for cold mornings.", vessel: "Glass Jar Soy Wax Candle", slot: "DISPLAY" }));
    expect(result.blocking_errors.map((entry) => entry.code)).toContain("apparel_on_non_apparel");
  });

  test("bag concept on candle creates a blocking error", () => {
    const result = validateProducts(validationFixture({ name: "Archive Backpack", description: "A carry bag for daily tools.", vessel: "Glass Jar Soy Wax Candle", slot: "DISPLAY" }));
    expect(result.blocking_errors.map((entry) => entry.code)).toContain("bag_on_wrong_vessel");
  });

  test("candle concept on candle is valid", () => {
    const result = validateProducts(validationFixture({ name: "Archive Candle", description: "A soy wax candle for the desk.", vessel: "Glass Jar Soy Wax Candle", slot: "DISPLAY" }));
    expect(result.blocking_errors).toHaveLength(0);
  });

  test("tee concept on tee is valid", () => {
    const result = validateProducts(validationFixture({ name: "Signal Tee", description: "A black tee for focused work.", vessel: "Unisex Heavyweight T-Shirt", slot: "WEAR" }));
    expect(result.blocking_errors).toHaveLength(0);
  });

  test("Youth tee for adult/default brand creates a warning", () => {
    const result = validateProducts(validationFixture({ name: "Signal Tee", description: "A black tee for focused work.", vessel: "Youth Classic Tee", slot: "WEAR" }));
    expect(result.warnings.map((entry) => entry.code)).toContain("youth_default_brand");
  });

  test("missing universal slot with unknown vessel creates a blocking error", () => {
    const result = validateProducts(validationFixture({ name: "Signal Object", description: "A physical object.", vessel: "Mystery Product", slot: undefined }));
    expect(result.blocking_errors.map((entry) => entry.code)).toContain("universal_slot_missing");
  });

  test("USE slot on hoodie creates a blocking error", () => {
    const result = validateProducts(validationFixture({ name: "Signal Hoodie", description: "A hoodie for focused work.", vessel: "Unisex Fleece Hoodie", slot: "USE" }));
    expect(result.blocking_errors.map((entry) => entry.code)).toContain("universal_slot_vessel_mismatch");
  });

  test("unclaimed drop using exact logo instruction creates a warning", () => {
    const result = validateProducts(validationFixture({
      name: "Signal Tee",
      description: "A black tee with the exact logo.",
      vessel: "Unisex Heavyweight T-Shirt",
      slot: "WEAR",
      printPrompt: "Place the official slogan and exact logo in the center."
    }));
    expect(result.warnings.map((entry) => entry.code)).toContain("unclaimed_direct_mark_language");
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

  test("Stripe event processing is idempotent and stores terminal status", async () => {
    const first = await beginStripeEventProcessing({ id: "evt_once", type: "checkout.session.completed", livemode: false, created: 123 });
    expect(first.shouldProcess).toBe(true);
    await markStripeEventProcessed("evt_once", { checkoutSessionId: "cs_once" });
    const duplicate = await beginStripeEventProcessing({ id: "evt_once", type: "checkout.session.completed", livemode: false, created: 123 });
    expect(duplicate.shouldProcess).toBe(false);
    expect(duplicate.event?.status).toBe("processed");
  });

  test("scout checkout records survive before the generation job exists", async () => {
    const target = canonicalizeDropUrl("https://mirror.anky.app/start");
    const scout = await createScoutCheckoutSessionRecord({
      stripeSessionId: "cs_scout",
      submittedUrl: target.originalSubmittedUrl,
      canonicalUrl: target.canonicalUrl,
      canonicalRootDomain: target.canonicalRootDomain,
      rootDomainHash: target.rootDomainHash,
      slug: "anky",
      scoutUserId: "usr_1",
      scoutUsername: "jp",
      amountTotal: 800,
      currency: "usd"
    });
    expect(scout.status).toBe("created");
    const completed = await updateScoutCheckoutSessionRecord("cs_scout", { status: "completed", generationJobId: "job_1", dropId: "drop_1" });
    expect(completed?.generationJobId).toBe("job_1");
    const duplicate = await createScoutCheckoutSessionRecord({
      stripeSessionId: "cs_scout",
      submittedUrl: target.originalSubmittedUrl,
      canonicalUrl: target.canonicalUrl,
      canonicalRootDomain: target.canonicalRootDomain,
      rootDomainHash: target.rootDomainHash,
      slug: "anky",
      amountTotal: 800,
      currency: "usd"
    });
    expect(duplicate.id).toBe(scout.id);
    expect(duplicate.status).toBe("completed");
  });

  test("active scout checkout lookup blocks duplicate in-flight root-domain sessions", async () => {
    const target = canonicalizeDropUrl("https://anky.app");
    const scout = await createScoutCheckoutSessionRecord({
      stripeSessionId: "cs_scout_active",
      submittedUrl: target.originalSubmittedUrl,
      canonicalUrl: target.canonicalUrl,
      canonicalRootDomain: target.canonicalRootDomain,
      rootDomainHash: target.rootDomainHash,
      slug: "anky",
      scoutUserId: "usr_1",
      scoutUsername: "jp",
      amountTotal: 800,
      currency: "usd",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      metadataJson: { provider: "stripe", type: "droplink_scout", environment: "live" }
    });
    const active = await getActiveScoutCheckoutByRootDomainHash(target.rootDomainHash);
    expect(active?.id).toBe(scout.id);
    expect((await getScoutCheckoutSessionByStripeSessionId(scout.stripeSessionId))?.id).toBe(scout.id);
    await updateScoutCheckoutSessionRecord(scout.stripeSessionId, { status: "expired" });
    expect(await getActiveScoutCheckoutByRootDomainHash(target.rootDomainHash)).toBeNull();
  });

  test("scout root-domain lock executes guarded operation in local store mode", async () => {
    const target = canonicalizeDropUrl("https://anky.app");
    const result = await withScoutRootDomainLock(target.rootDomainHash, async () => "locked");
    expect(result).toBe("locked");
  });

  test("checkout completion rejects Stripe sessions with wrong amount or currency", async () => {
    const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
    const relic = bundle.relics[0];
    const { checkout } = await reserveEditionForRelic({ relicId: relic.id, editionNumber: 1 });
    await attachStripeSession(checkout.id, "cs_verify");
    const lockedPrice = priceBookRelicPriceCents(bundle.drop?.priceBookJson, relic.id);
    await expect(
      verifyCheckoutSessionMatchesReservation({ stripeSessionId: "cs_verify", amountTotal: Number(lockedPrice) + 1, currency: relic.currency })
    ).rejects.toThrow("amount");
    await expect(
      verifyCheckoutSessionMatchesReservation({ stripeSessionId: "cs_verify", amountTotal: Number(lockedPrice), currency: "eur" })
    ).rejects.toThrow("currency");
    await expect(
      verifyCheckoutSessionMatchesReservation({ stripeSessionId: "cs_verify", amountTotal: Number(lockedPrice), currency: relic.currency })
    ).resolves.toBeTrue();
  });

  test("expired checkout cleanup releases stale reserved editions", async () => {
    const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
    const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 1, ttlMs: -1000 });
    expect(checkout.status).toBe("created");
    const result = await expireStaleCheckoutReservations();
    expect(result.expired).toBe(1);
    const second = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 1 });
    expect(second.edition.editionNumber).toBe(1);
  });

  test("payment failures, refunds, and disputes freeze order accruals for admin review", async () => {
    const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
    const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 1 });
    await attachStripeSession(checkout.id, "cs_failed");
    const failed = await markOrderPaymentFailed({ stripeSessionId: "cs_failed", reason: "card_declined" });
    expect(failed.status).toBe("expired");

    const { checkout: paidCheckout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 2 });
    await attachStripeSession(paidCheckout.id, "cs_refund");
    const sale = await completeCheckoutSale({ stripeSessionId: "cs_refund", stripePaymentIntentId: "pi_refund" });
    const refunded = await markOrderRefundedOrDisputed({ stripePaymentIntentId: "pi_refund", status: "refunded", reason: "requested_by_customer" });
    expect(refunded?.order.status).toBe("refunded");
    expect(refunded?.order.adminReviewRequired).toBe(true);
    expect(refunded?.accruals.every((entry) => entry.status === "reversed")).toBe(true);
    expect(sale.order.id).toBe(refunded!.order.id);
  });

  test("order receipt emails are transactional and non-blocking", async () => {
    process.env.AWS_REGION = "";
    process.env.RESEND_API_KEY = "";
    const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
    const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 1 });
    await attachStripeSession(checkout.id, "cs_receipt");
    const sale = await completeCheckoutSale({ stripeSessionId: "cs_receipt", stripePaymentIntentId: "pi_receipt", customerEmail: "buyer@example.com" });
    const result = await sendOrderReceiptEmail(sale.order.id);
    expect(result.sent).toBe(false);
    expect(result.reason).toContain("AWS_REGION");
  });
});

function stripeShippingJson() {
  return {
    customerDetails: {
      email: "buyer@example.com",
      name: "Buyer Example",
      address: {
        line1: "123 Test St",
        city: "Austin",
        state: "TX",
        country: "US",
        postal_code: "78701"
      }
    }
  };
}

async function createPaidOrderForFulfillment(stripeSessionId = `cs_${Date.now().toString(36)}`) {
  const bundle = await publishStorefront((await createBundle("claimed", "https://anky.app")).storefront.id);
  const { checkout } = await reserveEditionForRelic({ relicId: bundle.relics[0].id, editionNumber: 1 });
  await attachStripeSession(checkout.id, stripeSessionId);
  const sale = await completeCheckoutSale({
    stripeSessionId,
    stripePaymentIntentId: `pi_${stripeSessionId}`,
    customerEmail: "buyer@example.com",
    shippingJson: stripeShippingJson()
  });
  return sale.order;
}

function mockPrintfulFetch(input: {
  externalOrder?: Record<string, unknown> | null;
  createdOrderId?: string;
  failUnexpected?: boolean;
  calls?: string[];
}) {
  const calls = input.calls || [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const method = init?.method || "GET";
    calls.push(`${method} ${href}`);
    if (method === "GET" && /\/v2\/orders\/@/.test(href)) {
      if (!input.externalOrder) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      return Response.json({ data: input.externalOrder });
    }
    if (method === "POST" && /\/v2\/orders$/.test(href)) {
      return Response.json({
        data: {
          id: input.createdOrderId || "pf_created",
          external_id: JSON.parse(String(init?.body || "{}")).external_id,
          status: "draft",
          costs: { currency: "USD", total: "24.00" }
        }
      });
    }
    if (method === "POST" && /\/order-items$/.test(href)) return Response.json({ data: { id: "item_1" } });
    if (input.failUnexpected) throw new Error(`Unexpected Printful fetch: ${method} ${href}`);
    return Response.json({ data: {} });
  }) as typeof fetch;
  return calls;
}

describe("Printful draft safety", () => {
  test("paid order creates one Printful draft", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_create");
    mockPrintfulFetch({ createdOrderId: "pf_one" });
    const result = await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test" });
    expect(result.status).toBe("created");
    expect(result.providerOrderId).toBe("pf_one");
    const detail = await getOrderBundle(order.id);
    expect(detail?.fulfillmentOrder?.providerOrderId).toBe("pf_one");
    expect(detail?.fulfillmentOrder?.providerExternalId).toBe(order.id);
    expect(detail?.order.printfulStatus).toBe("draft_created");
  });

  test("retrying draft creation returns existing local fulfillment order and does not duplicate", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_existing");
    mockPrintfulFetch({ createdOrderId: "pf_existing" });
    await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test" });
    globalThis.fetch = (async () => {
      throw new Error("retry should not call Printful");
    }) as unknown as typeof fetch;
    const retry = await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test_retry" });
    expect(retry.status).toBe("existing_internal");
    expect(retry.providerOrderId).toBe("pf_existing");
    const detail = await getOrderBundle(order.id);
    expect(detail?.fulfillmentOrder?.providerOrderId).toBe("pf_existing");
  });

  test("external Printful lookup repairs local DB instead of creating duplicate draft", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_external");
    const calls = mockPrintfulFetch({
      externalOrder: { id: "pf_external", external_id: order.id, status: "draft", costs: { total: "30.00", currency: "USD" } },
      failUnexpected: true
    });
    const result = await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test_external" });
    expect(result.status).toBe("existing_external_repaired");
    expect(result.providerOrderId).toBe("pf_external");
    expect(calls.some((entry) => entry.startsWith("POST "))).toBe(false);
    const detail = await getOrderBundle(order.id);
    expect(detail?.fulfillmentOrder?.providerOrderId).toBe("pf_external");
    expect(detail?.order.printfulOrderId).toBe("pf_external");
  });

  test("Printful API success but DB save failure marks ambiguous admin-review state", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_ambiguous");
    mockPrintfulFetch({ createdOrderId: "pf_ambiguous" });
    __setFulfillmentTestHooks({
      createFulfillmentOrder: async () => {
        throw new Error("simulated db save failure");
      }
    });
    const result = await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test_failure" });
    expect(result.status).toBe("ambiguous_external_state");
    expect(result.providerOrderId).toBe("pf_ambiguous");
    const detail = await getOrderBundle(order.id);
    expect(detail?.order.printfulStatus).toBe("reconciliation_required");
    expect(detail?.order.printfulOrderId).toBe("pf_ambiguous");
    expect(detail?.order.adminReviewRequired).toBe(true);
  });

  test("manual retry repairs ambiguous state without duplicate creation and records system events", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_manual_retry");
    mockPrintfulFetch({ createdOrderId: "pf_manual_retry" });
    __setFulfillmentTestHooks({
      createFulfillmentOrder: async () => {
        throw new Error("simulated db save failure");
      }
    });
    await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test_failure" });
    __setFulfillmentTestHooks();
    process.env.DROPLINK_PRODUCTION_GUARDS = "true";
    const calls = mockPrintfulFetch({ externalOrder: null });
    const response = await adminPrintfulRetryPOST(
      new Request("http://droplink.test/api/admin/orders/order/printful/retry", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-user": "test-admin" },
        body: JSON.stringify({ force: true, reason: "test duplicate guard" })
      }),
      { params: { id: order.id } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("existing_order_field_repaired");
    expect(calls.some((entry) => entry.startsWith("POST "))).toBe(false);
    const detail = await getOrderBundle(order.id);
    expect(detail?.systemEvents.some((entry) => entry.eventType === "admin_printful_retry_requested")).toBe(true);
  });

  test("Printful confirmation remains disabled unless both env flags enable it", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_confirm_disabled");
    mockPrintfulFetch({ createdOrderId: "pf_confirm_disabled" });
    await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test" });
    await expect(confirmExistingPrintfulOrder({ orderId: order.id })).rejects.toThrow("Printful confirmation is disabled");
  });

  test("Printful webhook updates fulfillment state and tracking idempotently", async () => {
    const order = await createPaidOrderForFulfillment("cs_pf_webhook");
    mockPrintfulFetch({ createdOrderId: "pf_webhook" });
    await ensurePrintfulDraftForOrder({ orderId: order.id, triggeredBy: "test" });
    const payload = JSON.stringify({
      id: "evt_pf_ship",
      type: "shipment_sent",
      data: {
        order: { id: "pf_webhook", external_id: order.id, status: "shipped" },
        shipment: { tracking_url: "https://tracking.example/123" }
      }
    });
    const signature = createHmac("sha256", String(process.env.PRINTFUL_WEBHOOK_SECRET)).update(payload).digest("hex");
    const request = () =>
      new Request("http://droplink.test/api/printful/webhook", {
        method: "POST",
        headers: { "x-pf-signature": signature },
        body: payload
      });
    expect((await printfulWebhookPOST(request())).status).toBe(200);
    expect((await printfulWebhookPOST(request())).status).toBe(200);
    const detail = await getOrderBundle(order.id);
    expect(detail?.order.status).toBe("shipped");
    expect(detail?.order.printfulTrackingUrl).toBe("https://tracking.example/123");
    const events = (detail?.fulfillmentOrder?.webhookEventsJson as { events?: unknown[] } | null)?.events || [];
    expect(events).toHaveLength(1);
  });

  test("invalid Printful webhook signature is rejected in production-like mode", async () => {
    process.env.DROPLINK_PRODUCTION_GUARDS = "true";
    process.env.PRINTFUL_WEBHOOK_SECRET = "production_secret";
    const response = await printfulWebhookPOST(
      new Request("http://droplink.test/api/printful/webhook", {
        method: "POST",
        headers: { "x-pf-signature": "deadbeef" },
        body: JSON.stringify({ id: "evt_bad", type: "shipment_sent" })
      })
    );
    expect(response.status).toBe(401);
  });

  test("missing Printful webhook secret creates a production readiness blocker", async () => {
    process.env.DROPLINK_PRODUCTION_GUARDS = "true";
    delete process.env.PRINTFUL_WEBHOOK_SECRET;
    const bundle = await createBundle("claimed", "https://anky.app");
    const readiness = reviewReadiness(bundle);
    expect(readiness.blockers).toContain("printfulWebhookSecretConfigured");
  });

  test("frontend success page does not trigger fulfillment", async () => {
    const page = await readFile(join(process.cwd(), "src/app/[brandSlug]/page.tsx"), "utf8");
    const checkoutButton = await readFile(join(process.cwd(), "src/components/CheckoutButton.tsx"), "utf8");
    expect(page).not.toContain("ensurePrintfulDraftForOrder");
    expect(checkoutButton).not.toContain("ensurePrintfulDraftForOrder");
    expect(checkoutButton).toContain("/api/droplinks/");
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

function validationFixture(input: {
  name: string;
  description: string;
  vessel: string;
  slot?: "WEAR" | "DISPLAY" | "USE";
  printPrompt?: string;
}) {
  const now = new Date().toISOString();
  const relic: Relic = {
    id: "relic_validation",
    collectionId: "col_validation",
    dropId: "drop_validation",
    relicIndex: 1,
    slug: "validation",
    name: input.name,
    archetype: "signal",
    productFamily: input.vessel,
    description: input.description,
    whyThisExists: "A product drop for people who like precise physical objects.",
    artDirection: "Centered mark.",
    printfulProductId: "1",
    printfulVariantId: "2",
    fulfillmentSpecJson: {
      provider: "printful",
      catalogProductId: 1,
      catalogVariantId: 2,
      universalSlot: input.slot,
      storyRole: "test",
      productType: input.vessel,
      productName: input.vessel,
      variantName: "Black / M",
      placement: "front",
      technique: "dtg",
      printFileUrl: "https://assets.droplink.test/file.png",
      printFileSha256: "sha",
      retailPriceUsd: "52.00",
      selectionReason: "test"
    },
    unitPriceUsd: "52.00",
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
  };
  const assets: Asset[] = [
    {
      id: "asset_validation_print",
      collectionId: relic.collectionId,
      relicId: relic.id,
      type: "print_file",
      url: "https://assets.droplink.test/file.png",
      storageProvider: "r2",
      width: 900,
      height: 900,
      checksum: "sha",
      prompt: input.printPrompt || "Create raw artwork.",
      validationStatus: "valid",
      metadataJson: {},
      createdAt: now
    },
    {
      id: "asset_validation_lifestyle",
      collectionId: relic.collectionId,
      relicId: relic.id,
      type: "lifestyle",
      url: "https://assets.droplink.test/lifestyle.png",
      storageProvider: "r2",
      width: 1200,
      height: 1200,
      checksum: "sha-life",
      prompt: input.vessel.toLowerCase().includes("shirt") || input.vessel.toLowerCase().includes("tee") || input.vessel.toLowerCase().includes("hoodie")
        ? "Show one real person wearing the product naturally."
        : "Show the product naturally in a believable setting.",
      validationStatus: "valid",
      metadataJson: {},
      createdAt: now
    }
  ];
  return {
    brand: {
      id: "brand_validation",
      canonicalUrl: "https://adult.example/",
      hostname: "adult.example",
      slug: "adult-example",
      name: "Adult Example",
      createdAt: now,
      updatedAt: now
    },
    drop: {
      id: "drop_validation",
      storefrontId: "store_validation",
      originalSubmittedUrl: "https://adult.example/",
      canonicalUrl: "https://adult.example/",
      canonicalDomain: "adult.example",
      domainHash: "hash",
      status: "summoned" as const,
      domainClaimStatus: "unclaimed" as const,
      publishStatus: "blocked" as const,
      summonPriceUsdc: "8",
      creatorBountyBps: 800,
      protocolFeeBps: 0,
      totalSupply: 24,
      relicsPerDrop: 3,
      editionsPerRelic: 8,
      createdAt: now,
      updatedAt: now
    },
    storefront: {
      id: "store_validation",
      brandId: "brand_validation",
      slug: "adult-example",
      status: "summoned" as const,
      claimStatus: "unclaimed" as const,
      commerceMode: "preview" as const,
      commissionBps: 0,
      generationStatus: "READY_FOR_REVIEW" as const,
      createdAt: now,
      updatedAt: now
    },
    relics: [relic],
    assets
  };
}

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
    },
    {
      id: newId("asset"),
      collectionId: collection.id,
      relicId: relic.id,
      type: "lifestyle" as const,
      url: `https://assets.droplink.test/lifestyle/${relic.id}.png`,
      storageProvider: "r2",
      width: 1200,
      height: 1200,
      checksum: "test-lifestyle",
      prompt: "test lifestyle",
      validationStatus: "valid" as const,
      metadataJson: { storageKey: `lifestyle/${relic.id}.png` },
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
        universal_slot: "WEAR",
        story_role: `relic ${relic.relicIndex || 1} role`,
        role_in_triptych: `WEAR / relic ${relic.relicIndex || 1} role`,
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
