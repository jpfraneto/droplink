import { createHash } from "crypto";
import sharp from "sharp";
import {
  BRAND_STUDY_PROMPT_VERSION,
  RELIC_CRITIQUE_PROMPT_VERSION,
  RELIC_PLAN_PROMPT_VERSION,
  callHermesForCreativeTask
} from "./hermesDropAgent";
import { DROPLINK_DOCTRINE_VERSION, DROPLINK_SKILL_NAME } from "./droplinkDoctrine";
import { bestVisualReferences, buildBrandDiscoveryDossier } from "./brandDiscovery";
import { canonicalizeDropUrl } from "./dropCanonicalization";
import { assertFiniteDropConfig, dropConfig } from "./env";
import { newId } from "./hashes";
import { generateImage, manualImageMode } from "./imageProvider";
import { relicMockupSvg } from "./mockups";
import { ogPng as createOgPng } from "./og";
import { buildDropPriceBook } from "./pricing";
import { publicProductCopy } from "./publicCopy";
import { printfulCatalogImageUrl } from "./printfulReferences";
import { inferUniversalSlot, publicDropMode, validateProducts, vesselLockedConcept } from "./productValidation";
import {
  buildRelicFulfillmentSpec,
  createPrintfulMockup,
  mockupUrlsFromTask,
  printfulCatalogOptionsForPlanning,
  printfulConfigured,
  selectPrintfulCatalogVariant,
  type SelectedPrintfulVariant
} from "./printful";
import { scrapePublicPage } from "./scrape";
import { brandSlugFromUrl, slugify, uniqueSlug } from "./slugs";
import {
  existingStorefrontSlugs,
  recordEvent,
  saveGeneratedBundle,
  updateGenerationJobStep,
  updateGenerationStep
} from "./store";
import { putStoredObject } from "./storage";
import { domainFromUrl, normalizePublicUrl } from "./urls";
import type {
  AdminReview,
  Asset,
  Brand,
  BrandSnapshot,
  BrandStudy,
  Collection,
  Drop,
  DropSourceSignal,
  GenerationJob,
  GenerationStep,
  Mockup,
  OgImage,
  Relic,
  RelicEdition,
  RelicPlan,
  Storefront,
  StorefrontBundle
} from "./types";

const GENERATOR_VERSION = "hermes-drop-agent";

function appUrl(): string {
  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function checksumBuffer(input: Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

function brandVisibleText(input: string, brandName: string) {
  return input
    .replace(/\bDropLink\b/gi, brandName)
    .replace(/\bdroplink\b/gi, brandName)
    .replace(/\brelics?\b/gi, "artifact")
    .replace(/\beditions?\b/gi, "object")
    .replace(/\btriptych\b/gi, "collection")
    .replace(/\bSKUs?\b/g, "products")
    .replace(/\bproduct keys?\b/gi, "product")
    .replace(/\b(?:[123]\s*\/\s*3|#\s*[123])\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function productUseInstruction(productType: string, productName: string) {
  const combined = `${productType} ${productName}`.toLowerCase();
  if (/shirt|tee|hoodie|sweatshirt|hat|cap/.test(combined)) return "Show one real person wearing the product naturally.";
  if (/tote|bag/.test(combined)) return "Show one real person carrying or using the product naturally.";
  if (/poster|print/.test(combined)) return "Show one real person holding, hanging, or standing near the product in a believable interior.";
  if (/sticker/.test(combined)) return "Show the product applied to a real laptop, notebook, or object in someone's hands.";
  return "Show one real person using the product naturally in a believable setting.";
}

function publicModeInstruction(mode: ReturnType<typeof publicDropMode>) {
  if (mode === "claimed_official") {
    return "Claimed official mode: the owner may approve official assets and language, but still avoid unsafe copying unless assets are explicitly provided.";
  }
  return "Scouted unclaimed mode: this is an unofficial scout proposal. Avoid official logos, exact slogans, direct marks, trademark-heavy claims, and partnership language. Use abstract brand-native geometry, colors, moods, and symbolic forms.";
}

async function pngMetadata(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || null,
    height: metadata.height || null,
    contentType: metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "webp" ? "image/webp" : "image/png",
    fileType: metadata.format || "png"
  };
}

async function printArtQuality(buffer: Buffer) {
  const stats = await sharp(buffer)
    .resize(128, 128, { fit: "fill" })
    .grayscale()
    .stats();
  const channel = stats.channels[0];
  const mean = channel?.mean || 0;
  const stdev = channel?.stdev || 0;
  const tooFlat = stdev < 18;
  const washedOut = mean > 220 && stdev < 28;
  const swallowed = mean < 28 && stdev < 18;
  return {
    mean: Math.round(mean * 10) / 10,
    stdev: Math.round(stdev * 10) / 10,
    ok: !(tooFlat || washedOut || swallowed),
    reason: tooFlat
      ? "low contrast / mostly flat"
      : washedOut
        ? "washed out / mostly blank"
        : swallowed
          ? "too dark / swallowed by background"
          : "enough visual contrast"
  };
}

async function productArtBuffer(brand: Brand, relic: Relic, prompt: string, options: { width?: number; height?: number } = {}) {
  if (manualImageMode()) {
    const svg = relicMockupSvg(brand, relic);
    return {
      buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
      validationStatus: "pending" as const,
      provider: "manual_chatgpt"
    };
  }
  const generated = await generateImage(prompt, options);
  if (generated) return { buffer: generated.buffer, validationStatus: "valid" as const, provider: generated.provider };
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_MOCKS !== "true") {
    throw new Error(`Image generation failed for ${relic.name}.`);
  }
  const svg = relicMockupSvg(brand, relic);
  return {
    buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
    validationStatus: "mock" as const,
    provider: "dev_mock"
  };
}

async function event(
  storefrontId: string,
  eventType: string,
  step: GenerationStep,
  traceId: string,
  message: string,
  metadataJson = {},
  jobId?: string | null
) {
  if (jobId) await updateGenerationJobStep(jobId, step);
  await updateGenerationStep(storefrontId, step);
  await recordEvent({
    entityType: "storefront",
    entityId: storefrontId,
    eventType,
    level: "info",
    message,
    metadataJson,
    requestId: null,
    traceId
  });
}

function excerpt(input: string | undefined | null, length = 700) {
  return (input || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function sentence(input: string | undefined | null, length = 260) {
  const clean = excerpt(input, length);
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function humanList(values: string[], fallback = "") {
  const clean = values.map((entry) => entry.trim()).filter(Boolean);
  if (!clean.length) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function scoutLine(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}

export async function generateDropFromUrl(
  url: string,
  options: {
    jobId?: string;
    traceId?: string;
    brandId?: string;
    storefrontId?: string;
    collectionId?: string;
    dropId?: string;
    slug?: string;
    dnsClaimNonce?: string;
    summonerWallet?: string | null;
    scoutUserId?: string | null;
    creatorDisplayName?: string | null;
    summonPaymentTxHash?: string | null;
    summonPaymentMetadataJson?: Record<string, unknown> | null;
  } = {}
): Promise<StorefrontBundle> {
  assertFiniteDropConfig();
  const canonicalTarget = canonicalizeDropUrl(url);
  const normalized = await normalizePublicUrl(url);
  const canonicalUrl = canonicalTarget.canonicalUrl;
  const sourceUrl = canonicalTarget.sourceUrl;
  const hostname = canonicalTarget.canonicalRootDomain || canonicalTarget.canonicalDomain || domainFromUrl(canonicalUrl);
  const traceId = options.traceId || newId("run");
  const now = new Date().toISOString();
  const dropId = options.dropId || `drop_${canonicalTarget.rootDomainHash.slice(0, 24)}`;
  const brandId = options.brandId || newId("brand");
  const storefrontId = options.storefrontId || newId("store");
  const collectionId = options.collectionId || newId("col");
  const relicCount = dropConfig.relicsPerDrop;
  const baseSlug = brandSlugFromUrl(`https://${hostname}`);
  const slug = options.slug || uniqueSlug(baseSlug, await existingStorefrontSlugs());

  const brand: Brand = {
    id: brandId,
    canonicalUrl: `https://${hostname}/`,
    hostname,
    slug,
    name: hostname.replace(/\..*/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    createdAt: now,
    updatedAt: now
  };
  const storefront: Storefront = {
    id: storefrontId,
    brandId,
    slug,
    status: "summoned",
    claimStatus: "unclaimed",
    commerceMode: "preview",
    commissionBps: 0,
    customDomain: null,
    stripeConnectedAccountId: null,
    generationStatus: "INTAKE_CREATED",
    generationTraceId: traceId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
  const dnsClaimNonce = options.dnsClaimNonce || newId("dns").replace(/^dns_/, "");
  const drop: Drop = {
    id: dropId,
    storefrontId,
    originalSubmittedUrl: canonicalTarget.originalSubmittedUrl,
    submittedHost: canonicalTarget.submittedHost,
    submittedPath: canonicalTarget.submittedPath,
    sourceUrl,
    canonicalUrl,
    canonicalDomain: hostname,
    canonicalRootDomain: canonicalTarget.canonicalRootDomain,
    registrableDomain: canonicalTarget.registrableDomain,
    rootDomainHash: canonicalTarget.rootDomainHash,
    domainHash: canonicalTarget.rootDomainHash,
    status: "summoned",
    domainClaimStatus: "unclaimed",
    payoutStatus: "missing",
    payoutMethod: "none",
    publishStatus: "blocked",
    scoutUserId: options.scoutUserId || null,
    summonerWallet: options.summonerWallet || null,
    creatorDisplayName: options.creatorDisplayName || null,
    summonPaymentTxHash: options.summonPaymentTxHash || null,
    summonPaymentMetadataJson: options.summonPaymentMetadataJson || null,
    summonPriceUsdc: dropConfig.summonPriceUsdc,
    creatorBountyBps: dropConfig.creatorBountyBps,
    protocolFeeBps: dropConfig.protocolFeeBps,
    totalSupply: dropConfig.totalSupply,
    relicsPerDrop: dropConfig.relicsPerDrop,
    editionsPerRelic: dropConfig.editionsPerRelic,
    dnsClaimNonce,
    dnsRecordName: `_droplink.${hostname}`,
    dnsRecordValue: `droplink-claim=${dnsClaimNonce}`,
    domainOwnerName: null,
    domainOwnerWallet: null,
    domainOwnerEmail: null,
    domainClaimProofJson: null,
    domainClaimedAt: null,
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
    priceBookJson: null,
    projectedEconomicsJson: null,
    priceBookLockedAt: null,
    publishedAt: null,
    soldOutAt: null,
    archivedAt: null,
    readinessJson: null,
    createdAt: now,
    updatedAt: now
  };
  const sourceSignals: DropSourceSignal[] = [
    {
      id: newId("sig"),
      dropId,
      submittedUrl: canonicalTarget.originalSubmittedUrl,
      submittedHost: canonicalTarget.submittedHost,
      submittedPath: canonicalTarget.submittedPath,
      normalizedUrl: sourceUrl,
      submittedByWallet: options.summonerWallet || null,
      submittedAt: now,
      usedForGeneration: true,
      signalMetadataJson: { reason: "initial summon source" }
    }
  ];
  const placeholderCollection: Collection = {
    id: collectionId,
    storefrontId,
    dropId,
    type: "drop",
    status: "generating",
    title: `${brand.name} Artifacts`,
    subtitle: "a finite brand release",
    relicCount,
    ogImageId: null,
    generatorVersion: GENERATOR_VERSION,
    promptVersion: RELIC_PLAN_PROMPT_VERSION,
    createdAt: now,
    publishedAt: null
  };
  const job: GenerationJob = {
    id: options.jobId || newId("job"),
    storefrontId,
    collectionId,
    traceId,
    type: "drop",
    status: "running",
    currentStep: "INTAKE_CREATED",
    inputJson: { url: canonicalUrl, dropId, canonicalDomain: hostname },
    error: null,
    createdAt: now,
    updatedAt: now
  };
  await recordEvent({
    entityType: "storefront",
    entityId: storefrontId,
    eventType: "url_intake_created",
    level: "info",
    message: "Anky received the link and turned it into a scout trail: submitted URL, canonical source, root domain, and future DNS claim anchor.",
    metadataJson: {
      submittedUrl: canonicalTarget.originalSubmittedUrl,
      canonicalUrl,
      sourceUrl,
      canonicalRootDomain: hostname,
      slug
    },
    requestId: null,
    traceId
  });

  try {
    await event(storefrontId, "crawl_started", "CRAWLING", traceId, "Opening the public surface and reading the first layer of the brand.", {}, job.id);
    const page = await scrapePublicPage(sourceUrl);
    const crawlerFallback = page.textSample.includes("could not be read by the crawler");
    await event(storefrontId, "crawl_succeeded", "CRAWLED", traceId, crawlerFallback ? "The source blocked the crawler, so Anky keeps the trail alive with domain metadata and whatever public residue remains." : "Source page read; Anky has the first inscriptions, images, links, and texture of the brand.", {
      finalUrl: page.finalUrl,
      title: page.title,
      description: page.description,
      headings: page.headings.slice(0, 8),
      textSample: excerpt(page.textSample, 900),
      discoveredLinks: page.discoveredLinks.slice(0, 8),
      visualEvidence: page.visualEvidence.slice(0, 8),
      crawlerFallback
    }, job.id);
    await event(storefrontId, "brand_discovery_started", "DISCOVERING_BRAND", traceId, "Leaving the homepage to find the brand neighborhood: socials, icons, screenshots, repeated phrases, and visual residue.", {}, job.id);
    const discoveryDossier = buildBrandDiscoveryDossier({ page, canonicalRootDomain: hostname });
    const visualReferences = bestVisualReferences(discoveryDossier, 8);
    await event(storefrontId, "brand_discovery_succeeded", "BRAND_DISCOVERED", traceId, "Brand neighborhood mapped; the crawler found adjacent paths, visual fragments, and repeated language.", {
      discoveredLinks: discoveryDossier.discoveredLinks.length,
      visualEvidence: discoveryDossier.visualEvidence.length,
      strongVisualReferences: visualReferences.length,
      repeatedPhrases: discoveryDossier.textSignals.repeatedPhrases,
      pagesVisited: discoveryDossier.debug.pagesVisited,
      blockedUrls: discoveryDossier.debug.blockedUrls.slice(0, 8)
    }, job.id);
    await event(storefrontId, "brand_dossier_started", "BUILDING_DOSSIER", traceId, "Arranging the evidence into a dossier the creative agent can actually reason from.", {}, job.id);
    await event(storefrontId, "brand_dossier_ready", "DOSSIER_READY", traceId, "The dossier is ready: text signals, visual anchors, and neighborhood links are now one artifact of evidence.", {
      socialLinks: discoveryDossier.discoveredLinks.filter((link) => link.kind === "social" || link.kind === "same_as").slice(0, 8),
      topVisualEvidence: visualReferences.slice(0, 6),
      textSignals: {
        title: discoveryDossier.textSignals.title,
        description: discoveryDossier.textSignals.description,
        headings: discoveryDossier.textSignals.headings.slice(0, 8),
        repeatedPhrases: discoveryDossier.textSignals.repeatedPhrases,
        textSample: excerpt(discoveryDossier.textSignals.textSample, 900)
      }
    }, job.id);
    await event(storefrontId, "droplink_skill_loaded", "DISTILLING", traceId, "Anky loaded the Droplink doctrine: URL → hidden world → buyer role → WEAR / USE / DISPLAY → production assets.", {
      skill: DROPLINK_SKILL_NAME,
      doctrineVersion: DROPLINK_DOCTRINE_VERSION,
      agentRuntime: process.env.DROPLINK_AGENT_RUNTIME || "hermes_bridge_structured",
      contract: "hidden world, buyer role, WEAR/USE/DISPLAY relics, production assets, clean OG"
    }, job.id);
    const snapshot: BrandSnapshot = {
      id: newId("snap"),
      brandId,
      url: page.url,
      title: page.title,
      description: page.description,
      textSample: page.textSample,
      createdAt: now
    };

    await event(storefrontId, "brand_study_started", "DISTILLING", traceId, "Beginning the soul read: what posture, promise, taboo, and visual grammar live inside this link?", {}, job.id);
    await event(storefrontId, "hermes_brand_study_requested", "DISTILLING", traceId, "Hermes is distilling the public evidence into a living creative source, before any product is allowed to exist.", {
      evidenceCount: discoveryDossier.visualEvidence.length,
      neighborhoodLinks: discoveryDossier.discoveredLinks.slice(0, 10),
      textSignals: {
        title: discoveryDossier.textSignals.title,
        description: discoveryDossier.textSignals.description,
        repeatedPhrases: discoveryDossier.textSignals.repeatedPhrases
      }
    }, job.id);
    const studiedTask = await callHermesForCreativeTask({ type: "study_brand", input: { ...page, discoveryDossier, traceId } });
    if (studiedTask.type !== "study_brand") throw new Error("Hermes returned the wrong result type for brand study.");
    const studied = { study: studiedTask.study, modelVersion: studiedTask.modelVersion };
    brand.name = studied.study.brand_name;
    await event(storefrontId, "brand_study_succeeded", "DISTILLED", traceId, "Brand signal distilled: name, archetype, worldview, visual DNA, and the seed of the drop are now visible.", {
      modelVersion: studied.modelVersion,
      brandName: studied.study.brand_name,
      archetype: studied.study.archetype,
      essence: studied.study.essence,
      hiddenWorld: studied.study.hidden_world,
      buyerRole: studied.study.buyer_role,
      emotionalContract: studied.study.emotional_contract,
      worldview: studied.study.worldview,
      emotionalPosture: studied.study.emotional_posture,
      dropNarrativeSeed: studied.study.drop_narrative_seed,
      aestheticMotifs: studied.study.aesthetic_motifs,
      colorPalette: studied.study.color_palette,
      whatTheyCareAbout: studied.study.what_they_care_about,
      whatTheyBringToTheWorld: studied.study.what_they_bring_to_the_world,
      thingsToAvoid: studied.study.things_to_avoid,
      visualDna: studied.study.visual_dna,
      invocation: excerpt(studied.study.invocation, 1200)
    }, job.id);
    await event(
      storefrontId,
      "scout_core_collapsed",
      "DISTILLED",
      traceId,
      scoutLine([
        `Core collapsed for ${studied.study.brand_name}: ${sentence(studied.study.essence, 320)}`,
        studied.study.hidden_world ? `Hidden world: ${sentence(studied.study.hidden_world, 260)}` : "",
        studied.study.buyer_role ? `Buyer role: ${sentence(studied.study.buyer_role, 220)}` : "",
        studied.study.emotional_contract ? `Contract: ${sentence(studied.study.emotional_contract, 260)}` : "",
        sentence(studied.study.drop_narrative_seed, 320),
        `The objects must carry ${humanList(studied.study.aesthetic_motifs.slice(0, 3), "the visible motifs")}; feel like ${studied.study.visual_dna.material_feel}; and avoid ${humanList(studied.study.things_to_avoid.slice(0, 3), "generic merch")}.`
      ]),
      {
        brandName: studied.study.brand_name,
        core: studied.study.essence,
        hiddenWorld: studied.study.hidden_world,
        buyerRole: studied.study.buyer_role,
        emotionalContract: studied.study.emotional_contract,
        narrativeSeed: studied.study.drop_narrative_seed,
        worldview: studied.study.worldview,
        visualDna: studied.study.visual_dna,
        motifs: studied.study.aesthetic_motifs,
        palette: studied.study.color_palette,
        caresAbout: studied.study.what_they_care_about,
        avoid: studied.study.things_to_avoid
      },
      job.id
    );
    const brandStudy: BrandStudy = {
      id: newId("study"),
      brandId,
      storefrontId,
      promptVersion: BRAND_STUDY_PROMPT_VERSION,
      modelVersion: studied.modelVersion,
      studyJson: studied.study,
      createdAt: now
    };

    await event(storefrontId, "relic_plan_started", "PLANNING_RELICS", traceId, "Starting the triptych: one thing to wear, one to display, one to use — all from the same brand soul.", {}, job.id);
    const printfulCatalogOptions = await printfulCatalogOptionsForPlanning({ traceId });
    const mode = publicDropMode({ drop, storefront });
    await event(storefrontId, "printful_catalog_loaded", "PLANNING_RELICS", traceId, "Loaded the material catalog. The idea must now choose real vessels, not fantasy objects.", {
      optionCount: printfulCatalogOptions.length,
      options: printfulCatalogOptions.slice(0, 12)
    }, job.id);
    const initialPlanTask = await callHermesForCreativeTask({
      type: "plan_relics",
      input: { study: studied.study, relicCount: 3, collectionType: "drop", printfulCatalogOptions, traceId }
    });
    if (initialPlanTask.type !== "plan_relics") throw new Error("Hermes returned the wrong result type for relic planning.");
    await event(storefrontId, "relic_plan_drafted", "PLANNING_RELICS", traceId, "First three-object myth drafted; Anky is checking whether it feels like culture or just merch.", {
      relicCount: initialPlanTask.plan.relics.length,
      collectionTitle: initialPlanTask.plan.collection_title,
      collectionSubtitle: initialPlanTask.plan.collection_subtitle,
      dropConcept: initialPlanTask.plan.drop_concept,
      dropLore: initialPlanTask.plan.drop_lore,
      relics: initialPlanTask.plan.relics.map((relic) => ({
        name: relic.name,
        roleInTriptych: relic.role_in_triptych,
        productFamily: relic.product_family,
        whyThisExists: relic.why_this_exists
      }))
    }, job.id);
    const refinedPlanTask = await callHermesForCreativeTask({
      type: "critique_relics",
      input: {
        study: studied.study,
        initialPlan: initialPlanTask.plan,
        relicCount: 3,
        printfulCatalogOptions,
        traceId
      }
    });
    if (refinedPlanTask.type !== "critique_relics") throw new Error("Hermes returned the wrong result type for relic critique.");
    const planned = {
      plan: refinedPlanTask.plan,
      modelVersion:
        initialPlanTask.modelVersion === refinedPlanTask.modelVersion
          ? initialPlanTask.modelVersion
          : `${initialPlanTask.modelVersion}+${refinedPlanTask.modelVersion}`
    };
    const relicCritique = refinedPlanTask.critique;
    await event(storefrontId, "relic_plan_succeeded", "RELICS_PLANNED", traceId, "Creative director pass complete; weak merch energy was cut, and the three artifacts now share one thesis.", {
      relicCount: planned.plan.relics.length,
      collectionTitle: planned.plan.collection_title,
      collectionSubtitle: planned.plan.collection_subtitle,
      dropConcept: planned.plan.drop_concept,
      dropLore: planned.plan.drop_lore,
      relics: planned.plan.relics.map((relic) => ({
        name: relic.name,
        archetype: relic.archetype,
        roleInTriptych: relic.role_in_triptych,
        productFamily: relic.product_family,
        description: relic.description,
        whyThisExists: relic.why_this_exists,
        artDirection: relic.art_direction,
        suggestedPriceCents: relic.suggested_price_cents,
        printfulProductKey: relic.printful_product_key
      })),
      critique: relicCritique
    }, job.id);
    await event(
      storefrontId,
      "scout_matter_split",
      "RELICS_PLANNED",
      traceId,
      scoutLine([
        `The core split into three bodies: ${planned.plan.relics.map((relic) => `${relic.name} (${relic.product_family})`).join(" / ")}.`,
        `Why these exist: ${planned.plan.relics.map((relic) => sentence(relic.why_this_exists, 180)).join(" ")}`,
        `Unifying thesis: ${sentence(planned.plan.drop_concept, 360)}`
      ]),
      {
        collectionTitle: planned.plan.collection_title,
        dropConcept: planned.plan.drop_concept,
        dropLore: planned.plan.drop_lore,
        critique: relicCritique,
        relics: planned.plan.relics.map((relic) => ({
          name: relic.name,
          role: relic.role_in_triptych,
          productFamily: relic.product_family,
          whyThisExists: relic.why_this_exists,
          artDirection: relic.art_direction
        }))
      },
      job.id
    );
    const collection: Collection = {
      ...placeholderCollection,
      title: brandVisibleText(planned.plan.collection_title, brand.name),
      subtitle: brandVisibleText(planned.plan.collection_subtitle, brand.name)
    };
    const relicPlan: RelicPlan = {
      id: newId("plan"),
      collectionId,
      promptVersion: `${RELIC_PLAN_PROMPT_VERSION}/${RELIC_CRITIQUE_PROMPT_VERSION}`,
      modelVersion: planned.modelVersion,
      planJson: planned.plan,
      createdAt: now
    };

    await event(storefrontId, "printful_matching_started", "MATCHING_PRINTFUL", traceId, "Binding each artifact to a real Printful body so the drop can survive contact with manufacturing.", {}, job.id);
    const relicSlugSet = new Set<string>();
    const selectedVariants: SelectedPrintfulVariant[] = [];
    const usedProductCategories = new Set<string>();
    for (const entry of planned.plan.relics) {
      const selected = await selectPrintfulCatalogVariant({
        name: entry.name,
        archetype: entry.archetype,
        physicalArchetype: entry.physical_archetype,
        productFamily: `${entry.universal_slot || ""} ${entry.product_family} ${entry.printful_product_key}`,
        description: entry.description,
        artDirection: entry.art_direction,
        suggestedPriceCents: entry.suggested_price_cents,
        avoidProductCategories: [...usedProductCategories],
        traceId
      });
      selectedVariants.push(selected);
      usedProductCategories.add(selected.productCategory);
      await event(storefrontId, "printful_vessel_selected", "MATCHING_PRINTFUL", traceId, `Selected vessel for ${entry.name}: ${selected.product.name}.`, {
        conceptName: entry.name,
        requestedSlot: entry.universal_slot || inferUniversalSlot({ role: entry.role_in_triptych, productFamily: entry.product_family }),
        vesselProductName: selected.product.name,
        vesselVariantName: selected.variant.name,
        productCategory: selected.productCategory
      }, job.id);
    }
    planned.plan.relics = planned.plan.relics.map((entry, index) => {
      const selection = selectedVariants[index];
      const locked = vesselLockedConcept({
        name: entry.name,
        description: publicProductCopy(entry.description, { maxLength: 180 }),
        whyThisExists: publicProductCopy(entry.why_this_exists, { maxLength: 180 }),
        productFamily: entry.product_family,
        vesselName: selection.product.name,
        role: entry.role_in_triptych,
        universalSlot: entry.universal_slot || inferUniversalSlot({ role: entry.role_in_triptych, productFamily: entry.product_family, productName: selection.product.name })
      });
      const storyRole = entry.story_role || locked.storyRole || "brand object";
      return {
        ...entry,
        name: locked.name,
        universal_slot: locked.universalSlot || entry.universal_slot,
        story_role: storyRole,
        role_in_triptych: `${locked.universalSlot || entry.universal_slot || "USE"} / ${storyRole}`,
        product_family: locked.productFamily,
        description: locked.description,
        why_this_exists: locked.whyThisExists
      };
    });
    await event(storefrontId, "vessel_lock_applied", "PRINTFUL_MATCHED", traceId, "Product concepts were locked to the selected Printful vessels before artwork and product copy generation.", {
      products: planned.plan.relics.map((entry, index) => ({
        name: entry.name,
        universalSlot: entry.universal_slot,
        storyRole: entry.story_role,
        vesselProductName: selectedVariants[index]?.product.name,
        vesselVariantName: selectedVariants[index]?.variant.name,
        productCategory: selectedVariants[index]?.productCategory
      }))
    }, job.id);
    const relics: Relic[] = planned.plan.relics.map((entry, index) => {
      const selection = selectedVariants[index];
      const relicId = newId("relic");
      const relicSlug = uniqueSlug(slugify(entry.name), relicSlugSet);
      relicSlugSet.add(relicSlug);
      return {
        id: relicId,
        collectionId,
        dropId,
        relicIndex: index + 1,
        slug: relicSlug,
        name: brandVisibleText(entry.name, brand.name),
        archetype: brandVisibleText(entry.archetype, brand.name),
        productFamily: brandVisibleText(entry.product_family, brand.name),
        description: publicProductCopy(brandVisibleText(entry.description, brand.name), { maxLength: 190 }),
        whyThisExists: publicProductCopy(brandVisibleText(entry.why_this_exists, brand.name), { maxLength: 190 }),
        artDirection: brandVisibleText(entry.art_direction, brand.name),
        printfulProductId: String(selection.product.id),
        printfulVariantId: String(selection.variant.id),
        fulfillmentSpecJson: null,
        priceCents: Math.max(entry.suggested_price_cents, 1200),
        currency: "usd",
        totalSupply: 8,
        soldCount: 0,
        reservedCount: 0,
        status: "draft",
        createdAt: now,
        updatedAt: now
      };
    });
    await event(storefrontId, "printful_matched", "PRINTFUL_MATCHED", traceId, "All three artifacts found physical vessels. The collection can now be printed, worn, displayed, and used.", {
      selections: selectedVariants.map((selection, index) => ({
        relicName: planned.plan.relics[index]?.name,
        productId: selection.product.id,
        productName: selection.product.name,
        variantId: selection.variant.id,
        variantName: selection.variant.name,
        placement: selection.placement,
        technique: selection.technique,
        productCategory: selection.productCategory,
        selectionReason: selection.selectionReason
      }))
    }, job.id);

    await event(storefrontId, "print_files_started", "GENERATING_PRINT_FILES", traceId, "Generating the three raw print artworks in parallel: wear, display, and use now branch from the same core.", {
      relicThreads: relics.map((relic, index) => ({
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        productFamily: relic.productFamily,
        universalSlot: planned.plan.relics[index]?.universal_slot || null,
        role: planned.plan.relics[index]?.role_in_triptych || null
      }))
    }, job.id);
    const manuallyGeneratedImages = manualImageMode();
    const relicResults = await Promise.all(relics.map(async (relic, index) => {
      const planEntry = planned.plan.relics[index];
      const selection = selectedVariants[index];
      const printAssetId = newId("asset");
      const previewAssetId = newId("asset");
      const visualDna = studied.study.visual_dna;
      const prompt = [
        `Create ONLY the raw print-ready artwork file for ${brand.name}, one object in a cohesive three-object brand collection.`,
        "CRITICAL OUTPUT CONTRACT: generate a flat standalone design on a transparent or plain solid background. Do not render a hoodie, shirt, sweatshirt, tote, poster frame, model, hanger, room, scene, product mockup, label tag, watermark, or ecommerce photo.",
        "BRAND-ONLY VISIBILITY: the final artwork must look like it belongs to the represented brand, not to DropLink. Do not include the words DropLink, relic, edition, triptych, SKU, product key, 1/3, 2/3, 3/3, #1, #2, or #3 anywhere in the image.",
        "Do not show internal numbering, collection mechanics, edition counts, website UI, QR codes, checkout language, or platform labels. If you include text, use only short brand-native words or phrases that fit the brand itself.",
        "This image is the artwork that will be uploaded to Printful, not the product preview. It must be usable as a print file by itself.",
        "Keep all garment/product context as placement guidance only. The final pixels should be the design graphic, centered and isolated.",
        `Product: ${selection.product.name}, fixed variant: ${selection.variant.name}.`,
        "VESSEL LOCK: the product concept must agree with this exact selected vessel. If the vessel is a tee, the object is a tee. If the vessel is a candle, the object is a candle. Do not rename it into a different physical product.",
        `Placement: ${selection.placement}. Technique: ${selection.technique}.`,
        `Canonical slot: ${planEntry.universal_slot || "USE"}. Story role for variation only, not visible text: "${planEntry.story_role || planEntry.role_in_triptych}".`,
        `Drop concept: ${planned.plan.drop_concept}`,
        `Drop lore: ${planned.plan.drop_lore}`,
        `Drop narrative seed: ${studied.study.drop_narrative_seed}`,
        `Artifact concept: ${relic.name}. ${relic.description}`,
        `Why this exists: ${relic.whyThisExists}`,
        `Brand archetype: ${studied.study.archetype}`,
        `Brand essence: ${studied.study.essence}`,
        `Worldview: ${studied.study.worldview}`,
        `Living brand invocation excerpt: ${studied.study.invocation.slice(0, 1200)}`,
        `Visual DNA shapes: ${visualDna.core_shapes.join(", ")}`,
        `Visual DNA material feel: ${visualDna.material_feel}`,
        `Visual DNA composition rules: ${visualDna.composition_rules.join("; ")}`,
        `Signature gesture: ${visualDna.signature_gesture}`,
        `Aesthetic motifs: ${studied.study.aesthetic_motifs.join(", ")}`,
        `Color palette: ${studied.study.color_palette.join(", ")}`,
        `Art direction: ${relic.artDirection}`,
        visualReferences.length
          ? `Brand visual references discovered during the rabbit-hole pass. Use as loose evidence, not exact logo/mark source:\n${visualReferences.map((entry, refIndex) => `${refIndex + 1}. ${entry.url} (${entry.kind}, score ${entry.score}) — ${entry.reason}`).join("\n")}`
          : "No strong brand visual references were found; rely on the written dossier and avoid overclaiming visual specificity.",
        discoveryDossier.discoveredLinks.length
          ? `Brand neighborhood links:\n${discoveryDossier.discoveredLinks.slice(0, 8).map((entry) => `${entry.kind}: ${entry.url}`).join("\n")}`
          : "",
        "Make this raw artwork visually related to the other two brand artifacts: shared palette, shared symbolic grammar, distinct role.",
        "Use precise, print-friendly geometry, clean edges, generous transparent/plain negative space, and no photographic product rendering.",
        "If using words, use only short original phrases implied by the plan; avoid dense copy and avoid copying website text verbatim.",
        publicModeInstruction(mode),
        "Before finalizing, remove any visible text that describes the artifact as a relic, edition, drop, numbered item, SKU, or DropLink object.",
        `Avoid: ${studied.study.things_to_avoid.join(", ")}`,
        page.ogImage ? `Use this source image only as loose brand reference, not as a logo to copy exactly: ${page.ogImage}` : "",
        page.favicon ? `Optional favicon reference: ${page.favicon}` : "",
        "Avoid trademarked logos unless they are visibly present in the public source. Final answer must be raw design only: no mockup, no shirt body, no background scene."
      ].filter(Boolean).join("\n");
      await event(storefrontId, "relic_print_prompt_ready", "GENERATING_PRINT_FILES", traceId, `Thread ${index + 1}/3 opened for ${relic.name}: raw artwork prompt prepared.`, {
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        productName: selection.product.name,
        variantName: selection.variant.name,
        role: planEntry.role_in_triptych,
        artDirection: relic.artDirection,
        visualReferences: visualReferences.slice(0, 6),
        promptExcerpt: excerpt(prompt, 1600)
      }, job.id);
      let activePrintPrompt = prompt;
      let generated = await productArtBuffer(brand, relic, activePrintPrompt, { width: 1024, height: 1024 });
      let rawQuality = await printArtQuality(generated.buffer);
      if (!rawQuality.ok && generated.validationStatus === "valid") {
        await event(storefrontId, "relic_print_art_weak", "GENERATING_PRINT_FILES", traceId, `${relic.name} first artwork was too faint (${rawQuality.reason}). Regenerating with a stronger visible symbol before the artifact is allowed to continue.`, {
          relicId: relic.id,
          relicIndex: relic.relicIndex,
          relicName: relic.name,
          productName: selection.product.name,
          quality: rawQuality,
          imageRole: "print_art"
        }, job.id);
        activePrintPrompt = `${prompt}\n\nQUALITY RETRY: the previous attempt was too faint or blank. Generate a visibly stronger print artwork now. Use one large central symbol or clear repeating pattern, high contrast, readable silhouette at thumbnail size, and at least two distinct value zones. Avoid pale-on-white minimalism, tiny marks floating in empty space, and nearly blank compositions. The artwork can still be elegant, but it must be immediately visible and memorable.`;
        generated = await productArtBuffer(brand, relic, activePrintPrompt, { width: 1024, height: 1024 });
        rawQuality = await printArtQuality(generated.buffer);
      }
      const normalizedPng = await sharp(generated.buffer).png({ compressionLevel: 9 }).toBuffer();
      const previewWebp = await sharp(normalizedPng)
        .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const metadata = await pngMetadata(normalizedPng);
      const fileSha256 = checksumBuffer(normalizedPng);
      const previewSha256 = checksumBuffer(previewWebp);
      const printObject = await putStoredObject({
        key: `collections/${collectionId}/relics/${relic.id}/print-${fileSha256.slice(0, 16)}.png`,
        body: normalizedPng,
        contentType: "image/png"
      });
      const previewObject = await putStoredObject({
        key: `collections/${collectionId}/relics/${relic.id}/preview-${previewSha256.slice(0, 16)}.webp`,
        body: previewWebp,
        contentType: "image/webp"
      });
      await event(storefrontId, "relic_print_art_ready", "GENERATING_PRINT_FILES", traceId, `${relic.name} raw artwork emerged from the core. This is the graphic spell before it touches the product.`, {
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        productName: selection.product.name,
        printFileUrl: printObject.url,
        previewUrl: previewObject.url,
        validationStatus: generated.validationStatus,
        imageProvider: generated.provider,
        imageRole: "print_art",
        quality: rawQuality
      }, job.id);
      const fulfillmentSpec = buildRelicFulfillmentSpec({
        concept: {
          name: planEntry.name,
          archetype: planEntry.archetype,
          physicalArchetype: planEntry.physical_archetype,
          productFamily: planEntry.product_family,
          description: planEntry.description,
          artDirection: planEntry.art_direction,
          suggestedPriceCents: Math.max(planEntry.suggested_price_cents, relic.priceCents),
          traceId
        },
        selection,
        printFileUrl: printObject.url,
        printFileSha256: fileSha256
      });
      const printfulReferenceImageUrl = printfulCatalogImageUrl(fulfillmentSpec.rawPrintfulCatalogSnapshotJson);
      relic.fulfillmentSpecJson = {
        ...fulfillmentSpec,
        universalSlot: planEntry.universal_slot || inferUniversalSlot({ role: planEntry.role_in_triptych, productFamily: planEntry.product_family, productName: fulfillmentSpec.productName }) || undefined,
        storyRole: planEntry.story_role || undefined
      };
      relic.priceCents = Math.max(relic.priceCents, Math.round(Number(fulfillmentSpec.retailPriceUsd) * 100));
      await event(storefrontId, "relic_fulfillment_spec_ready", "GENERATING_PRINT_FILES", traceId, `Fulfillment spec selected for ${relic.name}.`, {
        relicId: relic.id,
        relicName: relic.name,
        productName: fulfillmentSpec.productName,
        variantName: fulfillmentSpec.variantName,
        placement: fulfillmentSpec.placement,
        technique: fulfillmentSpec.technique,
        universalSlot: relic.fulfillmentSpecJson.universalSlot,
        storyRole: relic.fulfillmentSpecJson.storyRole,
        retailPriceUsd: fulfillmentSpec.retailPriceUsd,
        estimatedPrintfulCostUsd: fulfillmentSpec.estimatedPrintfulCostUsd,
        selectionReason: fulfillmentSpec.selectionReason,
        printfulProductImageUrl: printfulReferenceImageUrl
      }, job.id);
      const printFile: Asset = {
        id: printAssetId,
        collectionId,
        relicId: relic.id,
        type: "print_file",
        url: printObject.url,
        storageProvider: printObject.storageProvider,
        width: metadata.width,
        height: metadata.height,
        checksum: fileSha256,
        prompt: activePrintPrompt,
        validationStatus: generated.validationStatus,
        metadataJson: {
          fileType: metadata.fileType,
          contentType: metadata.contentType,
          storageKey: printObject.key,
          byteSize: printObject.byteSize,
          placement: fulfillmentSpec.placement,
          technique: fulfillmentSpec.technique,
          imageProvider: generated.provider,
          manualUploadRequired: generated.validationStatus === "pending",
          sourceOgImage: page.ogImage || null,
          sourceFavicon: page.favicon || null,
          discoveryDossier: {
            discoveredLinks: discoveryDossier.discoveredLinks.slice(0, 12),
            visualEvidence: discoveryDossier.visualEvidence.slice(0, 12),
            repeatedPhrases: discoveryDossier.textSignals.repeatedPhrases
          },
          dropConcept: planned.plan.drop_concept,
          universalSlot: relic.fulfillmentSpecJson.universalSlot,
          storyRole: relic.fulfillmentSpecJson.storyRole,
          roleInTriptych: planEntry.role_in_triptych,
          relicCritique,
          printfulProductImageUrl: printfulReferenceImageUrl
        },
        createdAt: now
      };
      const previewAsset: Asset = {
        id: previewAssetId,
        collectionId,
        relicId: relic.id,
        type: "preview",
        url: previewObject.url,
        storageProvider: previewObject.storageProvider,
        width: 900,
        height: 900,
        checksum: previewSha256,
        prompt: activePrintPrompt,
        validationStatus: generated.validationStatus,
        metadataJson: {
          fileType: "webp",
          contentType: "image/webp",
          storageKey: previewObject.key,
          byteSize: previewObject.byteSize,
          sourceAssetId: printAssetId,
          imageRole: "print_art_preview"
        },
        createdAt: now
      };
      let relicMockup: Mockup;
      if (printfulConfigured() && generated.validationStatus === "valid") {
        try {
          const task = await createPrintfulMockup({ relic, spec: fulfillmentSpec, traceId });
          const urls = mockupUrlsFromTask(task.result);
          relic.fulfillmentSpecJson = { ...relic.fulfillmentSpecJson, mockupTaskId: task.taskId, mockupUrls: urls };
          relicMockup = {
            id: newId("mock"),
            relicId: relic.id,
            assetId: printFile.id,
            imageUrl: urls[0] || previewObject.url,
            printfulTaskId: task.taskId,
            viewName: "front",
            status: urls.length ? "ready" : "pending",
            createdAt: now
          };
        } catch (mockupError) {
          await event(storefrontId, "printful_mockup_failed_soft", "GENERATING_LIFESTYLE_IMAGES", traceId, `Printful mockup failed for ${relic.name}; keeping the generated product image as the visible artifact instead of killing the scout pass.`, {
            relicId: relic.id,
            relicName: relic.name,
            productName: fulfillmentSpec.productName,
            reason: mockupError instanceof Error ? mockupError.message : "Printful mockup failed.",
            fallbackPreviewUrl: previewObject.url
          }, job.id);
          relicMockup = {
            id: newId("mock"),
            relicId: relic.id,
            assetId: printFile.id,
            imageUrl: previewObject.url,
            printfulTaskId: null,
            viewName: "front",
            status: "mockup_failed_soft",
            createdAt: now
          };
        }
      } else {
        relicMockup = {
          id: newId("mock"),
          relicId: relic.id,
          assetId: printFile.id,
          imageUrl: previewObject.url,
          printfulTaskId: null,
          viewName: "front",
          status: generated.validationStatus === "valid" ? "pending" : generated.validationStatus === "pending" ? "manual_pending" : "mock",
          createdAt: now
        };
      }
      await event(storefrontId, "lifestyle_image_started", "GENERATING_LIFESTYLE_IMAGES", traceId, `Thread ${index + 1}/3 continues: placing ${relic.name} onto the product image.`, {
        relicId: relic.id,
        productName: fulfillmentSpec.productName,
        variantName: fulfillmentSpec.variantName,
        previewUrl: previewObject.url
      }, job.id);
      const lifestylePrompt = [
        `Create a catchy editorial product-in-use image for ${brand.name}.`,
        productUseInstruction(fulfillmentSpec.productType, fulfillmentSpec.productName),
        "VESSEL LOCK: preserve this selected physical vessel exactly. Do not depict a different product type.",
        `Product: ${fulfillmentSpec.productName}, fixed variant: ${fulfillmentSpec.variantName}.`,
        `Use this uploaded print artwork as the exact design that appears on the product: ${previewObject.url}`,
        printfulReferenceImageUrl
          ? `Use this selected Printful catalog item image as the base product silhouette, color, and proportions: ${printfulReferenceImageUrl}`
          : "Use the selected Printful product name and variant as the base product form; preserve believable catalog proportions.",
        `Artifact: ${relic.name}. ${relic.description}`,
        `Canonical slot: ${relic.fulfillmentSpecJson.universalSlot || planEntry.universal_slot || "USE"}. Internal story role for variation only, not visible text: ${planEntry.story_role || planEntry.role_in_triptych}`,
        `Collection concept: ${planned.plan.drop_concept}`,
        `Shared visual system: ${studied.study.visual_dna.core_shapes.join(", ")}; ${studied.study.visual_dna.material_feel}; ${studied.study.visual_dna.signature_gesture}`,
        `Aesthetic motifs: ${studied.study.aesthetic_motifs.join(", ")}`,
        `Color palette: ${studied.study.color_palette.join(", ")}`,
        visualReferences.length
          ? `Use these brand references only as loose visual evidence, not as exact logos to copy:\n${visualReferences.slice(0, 6).map((entry, refIndex) => `${refIndex + 1}. ${entry.url} (${entry.kind})`).join("\n")}`
          : "",
        "The image should feel real, current, and inspectable: clear product visibility, believable human scale, no fake UI chrome.",
        "Do not invent extra products. Do not use celebrity likenesses. Do not copy exact unauthorized logos. Avoid stock-photo blandness.",
        publicModeInstruction(mode),
        "Do not include the words DropLink, relic, edition, triptych, SKU, 1/3, 2/3, 3/3, #1, #2, or #3 as visible text.",
        `Avoid: ${studied.study.things_to_avoid.join(", ")}`
      ].filter(Boolean).join("\n");
      await event(storefrontId, "lifestyle_prompt_ready", "GENERATING_LIFESTYLE_IMAGES", traceId, `Product image prompt prepared for ${relic.name}.`, {
        relicId: relic.id,
        relicName: relic.name,
        productName: fulfillmentSpec.productName,
        variantName: fulfillmentSpec.variantName,
        printArtPreviewUrl: previewObject.url,
        promptExcerpt: excerpt(lifestylePrompt, 1400)
      }, job.id);
      const lifestyleGenerated = await productArtBuffer(brand, relic, lifestylePrompt, { width: 1024, height: 1024 });
      const lifestylePng = await sharp(lifestyleGenerated.buffer)
        .resize({ width: 1200, height: 1200, fit: "cover" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const lifestyleSha256 = checksumBuffer(lifestylePng);
      const lifestyleMetadata = await pngMetadata(lifestylePng);
      const lifestyleObject = await putStoredObject({
        key: `collections/${collectionId}/relics/${relic.id}/lifestyle-${lifestyleSha256.slice(0, 16)}.png`,
        body: lifestylePng,
        contentType: "image/png"
      });
      const lifestyleAsset: Asset = {
        id: newId("asset"),
        collectionId,
        relicId: relic.id,
        type: "lifestyle",
        url: lifestyleObject.url,
        storageProvider: lifestyleObject.storageProvider,
        width: lifestyleMetadata.width,
        height: lifestyleMetadata.height,
        checksum: lifestyleSha256,
        prompt: lifestylePrompt,
        validationStatus: lifestyleGenerated.validationStatus,
        metadataJson: {
          fileType: lifestyleMetadata.fileType,
          contentType: lifestyleMetadata.contentType,
          storageKey: lifestyleObject.key,
          byteSize: lifestyleObject.byteSize,
          sourcePrintAssetId: printAssetId,
          sourcePreviewAssetId: previewAssetId,
          productName: fulfillmentSpec.productName,
          variantName: fulfillmentSpec.variantName,
          catalogProductId: fulfillmentSpec.catalogProductId,
          catalogVariantId: fulfillmentSpec.catalogVariantId,
          universalSlot: relic.fulfillmentSpecJson.universalSlot,
          storyRole: relic.fulfillmentSpecJson.storyRole,
          printfulProductImageUrl: printfulReferenceImageUrl,
          imageProvider: lifestyleGenerated.provider,
          manualUploadRequired: lifestyleGenerated.validationStatus === "pending",
          visualEvidence: visualReferences.slice(0, 8)
        },
        createdAt: now
      };
      await event(storefrontId, "lifestyle_image_generated", "GENERATING_LIFESTYLE_IMAGES", traceId, `${relic.name} product image generated. This thread has gone from core → art → usable object.`, {
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        productName: fulfillmentSpec.productName,
        lifestyleImageUrl: lifestyleObject.url,
        previewUrl: previewObject.url,
        validationStatus: lifestyleGenerated.validationStatus,
        imageRole: "product_image",
        prompt: lifestylePrompt
      }, job.id);
      await event(storefrontId, "relic_assets_generated", "GENERATING_LIFESTYLE_IMAGES", traceId, `${relic.name} thread complete: print art, product image, and fulfillment trail are ready.`, {
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        productName: fulfillmentSpec.productName,
        variantName: fulfillmentSpec.variantName,
        catalogProductId: fulfillmentSpec.catalogProductId,
        catalogVariantId: fulfillmentSpec.catalogVariantId,
        placement: fulfillmentSpec.placement,
        technique: fulfillmentSpec.technique,
        printFileUrl: printObject.url,
        previewUrl: previewObject.url,
        lifestyleImageUrl: lifestyleObject.url,
        printFileSha256: fileSha256,
        mockupStatus: relicMockup.status,
        mockupTaskId: relicMockup.printfulTaskId || null,
        mockupImageUrl: relicMockup.imageUrl || null
      }, job.id);
      return { assets: [printFile, previewAsset, lifestyleAsset], mockup: relicMockup };
    }));
    const assets: Asset[] = relicResults.flatMap((result) => result.assets);
    const mockups: Mockup[] = relicResults.map((result) => result.mockup);
    const productValidation = validateProducts({ brand, drop, storefront, relics, assets, checkedAt: now });
    drop.readinessJson = { productValidation };
    for (const asset of assets) {
      if (!asset.relicId) continue;
      const relicIssues = [
        ...productValidation.blocking_errors.filter((issue) => issue.relicId === asset.relicId),
        ...productValidation.warnings.filter((issue) => issue.relicId === asset.relicId)
      ];
      asset.metadataJson = {
        ...(asset.metadataJson || {}),
        productValidation: {
          status: relicIssues.some((issue) => productValidation.blocking_errors.includes(issue)) ? "blocked" : relicIssues.length ? "warning" : "valid",
          issues: relicIssues
        }
      };
    }
    await event(storefrontId, "product_validation_completed", "LIFESTYLE_IMAGES_READY", traceId, productValidation.blocking_errors.length ? "Product validation found blocking concept-vessel errors." : "Product validation completed; no blocking concept-vessel errors found.", {
      status: productValidation.status,
      mode: productValidation.mode,
      blockingErrors: productValidation.blocking_errors,
      warnings: productValidation.warnings
    }, job.id);
    await event(storefrontId, "parallel_relic_threads_collapsed", "LIFESTYLE_IMAGES_READY", traceId, "All three artifact threads completed in parallel. The system can now collapse them into the final OG image.", {
      relics: relics.map((relic) => ({
        relicId: relic.id,
        relicIndex: relic.relicIndex,
        relicName: relic.name,
        previewUrl: assets.find((asset) => asset.relicId === relic.id && asset.type === "preview")?.url,
        lifestyleImageUrl: assets.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle")?.url
      }))
    }, job.id);
    await event(storefrontId, "print_files_ready", "PRINT_FILES_READY", traceId, "Print files generated; the abstract brand signal now has printable surfaces.", {}, job.id);
    await event(storefrontId, "lifestyle_images_ready", "LIFESTYLE_IMAGES_READY", traceId, "Product-in-use images generated; the artifacts have entered human scenes.", {
      ready: assets.filter((asset) => asset.type === "lifestyle" && asset.validationStatus === "valid").length,
      total: relics.length
    }, job.id);
    if (manuallyGeneratedImages) {
      await event(
        storefrontId,
        "manual_product_image_prompts_ready",
        "AWAITING_MANUAL_IMAGES",
        traceId,
        "Manual product and lifestyle image prompts are ready for admin upload.",
        { relicIds: relics.map((relic) => relic.id) },
        job.id
      );
    } else {
      await event(storefrontId, "print_files_valid", "PRINT_FILES_VALID", traceId, "Print files passed conservative validation; the edges held.", {}, job.id);
    }
    await event(storefrontId, "mockups_ready", "MOCKUPS_READY", traceId, "Mockup pass complete; the artifacts have bodies the owner can inspect.", {
      ready: mockups.filter((mockup) => mockup.status === "ready").length,
      total: mockups.length
    }, job.id);

    const priceBook = buildDropPriceBook({
      dropId,
      relics,
      generatedAt: now,
      generatedBy: "hermes-drop-agent",
      summonFeeUsd: drop.summonPriceUsdc
    });
    drop.priceBookJson = priceBook;
    drop.projectedEconomicsJson = priceBook.totals;
    for (const relic of relics) {
      const price = priceBook.relics.find((entry) => entry.relicId === relic.id);
      if (!price) throw new Error(`Price book missing relic ${relic.id}.`);
      relic.unitPriceUsd = price.unitPriceUsd;
      relic.priceBookId = dropId;
      relic.priceCents = Math.round(Number(price.unitPriceUsd) * 100);
    }
    await event(storefrontId, "price_book_generated", "PRINT_FILES_VALID", traceId, "Economics mapped: owner proceeds, scout bounty, production cost, and protocol survival are on the same ledger.", {
      projectedDomainOwnerProceedsUsd: priceBook.totals.projectedDomainOwnerProceedsUsd,
      maxGrossRevenueUsd: priceBook.totals.maxGrossRevenueUsd,
      estimatedTotalPrintfulCostUsd: priceBook.totals.estimatedTotalPrintfulCostUsd,
      estimatedTotalNetMarginUsd: priceBook.totals.estimatedTotalNetMarginUsd,
      relics: priceBook.relics.map((price) => ({
        relicName: price.relicName,
        unitPriceUsd: price.unitPriceUsd,
        estimatedUnitPrintfulCostUsd: price.estimatedUnitPrintfulCostUsd,
        estimatedUnitNetMarginUsd: price.estimatedUnitNetMarginUsd,
        pricingReason: price.pricingReason
      }))
    }, job.id);

    await event(storefrontId, "og_generation_started", "GENERATING_OG", traceId, "OG image generation started.", {}, job.id);
    const ogPrompt = [
      `Create a 1200x630 brand share image for ${brand.name}.`,
      `Brand archetype: ${studied.study.archetype}`,
      `Brand essence: ${studied.study.essence}`,
      `Worldview: ${studied.study.worldview}`,
      `Invocation excerpt: ${studied.study.invocation.slice(0, 900)}`,
      `Collection: ${collection.title} — ${collection.subtitle}`,
      `Drop concept: ${planned.plan.drop_concept}`,
      `Drop lore: ${planned.plan.drop_lore}`,
      `Narrative seed: ${studied.study.drop_narrative_seed}`,
      `Use the three product-in-use images as primary references and compose them together as one launch image.`,
      `Products: ${relics.map((relic, index) => `${relic.name} (${relic.productFamily}, internal role: ${planned.plan.relics[index]?.role_in_triptych || "brand artifact"})`).join("; ")}`,
      `Visual DNA shapes: ${studied.study.visual_dna.core_shapes.join(", ")}`,
      `Visual DNA material feel: ${studied.study.visual_dna.material_feel}`,
      `Signature gesture: ${studied.study.visual_dna.signature_gesture}`,
      `Aesthetic motifs: ${studied.study.aesthetic_motifs.join(", ")}`,
      `Color palette: ${studied.study.color_palette.join(", ")}`,
      "Include no fake UI chrome, no unauthorized exact logos, no celebrity likenesses, and no extra product concepts.",
      publicModeInstruction(mode),
      "Do not include the words DropLink, relic, edition, triptych, SKU, 1/3, 2/3, 3/3, #1, #2, or #3 as visible text.",
      "Make it feel like one coherent brand release, not a collage of unrelated mockups."
    ].join("\n");
    await event(storefrontId, "og_prompt_ready", "GENERATING_OG", traceId, "Share image prompt prepared.", {
      collectionTitle: collection.title,
      collectionSubtitle: collection.subtitle,
      sourceLifestyleImageUrls: relics.map((relic) => assets.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle")?.url).filter(Boolean),
      promptExcerpt: excerpt(ogPrompt, 1400)
    }, job.id);
    const lifestyleImageUrls = relics.map((relic) => assets.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle")?.url);
    const generatedOg = manuallyGeneratedImages ? null : await generateImage(ogPrompt, { width: 1216, height: 640 });
    const ogPng = generatedOg
      ? await sharp(generatedOg.buffer).resize({ width: 1200, height: 630, fit: "cover" }).png({ compressionLevel: 9 }).toBuffer()
      : await createOgPng(brand, collection, relics, {
          imageUrls: relics.map((relic, index) => lifestyleImageUrls[index] || mockups.find((mockup) => mockup.relicId === relic.id)?.imageUrl),
          publicPath: hostname
        });
    const ogWebp = await sharp(ogPng).webp({ quality: 82 }).toBuffer();
    const ogChecksum = checksumBuffer(ogPng);
    const ogWebpChecksum = checksumBuffer(ogWebp);
    const ogAssetId = newId("asset");
    const ogWebpAssetId = newId("asset");
    const ogObject = await putStoredObject({
      key: `collections/${collectionId}/og-${ogChecksum.slice(0, 16)}.png`,
      body: ogPng,
      contentType: "image/png"
    });
    const ogWebpObject = await putStoredObject({
      key: `collections/${collectionId}/og-${ogWebpChecksum.slice(0, 16)}.webp`,
      body: ogWebp,
      contentType: "image/webp"
    });
    const ogAsset: Asset = {
      id: ogAssetId,
      collectionId,
      relicId: null,
      type: "og",
      url: ogObject.url,
      storageProvider: ogObject.storageProvider,
      width: 1200,
      height: 630,
      checksum: ogChecksum,
      prompt: ogPrompt,
      validationStatus: manuallyGeneratedImages ? "pending" : "valid",
      metadataJson: {
        fileType: "png",
        contentType: "image/png",
        storageKey: ogObject.key,
        byteSize: ogObject.byteSize,
        imageProvider: manuallyGeneratedImages ? "manual_chatgpt" : generatedOg?.provider || "sharp_composite",
        manualUploadRequired: manuallyGeneratedImages,
        sourceRelicIds: relics.map((relic) => relic.id),
        sourceLifestyleImageUrls: lifestyleImageUrls
      },
      createdAt: now
    };
    assets.push(ogAsset);
    assets.push({
      id: ogWebpAssetId,
      collectionId,
      relicId: null,
      type: "preview",
      url: ogWebpObject.url,
      storageProvider: ogWebpObject.storageProvider,
      width: 1200,
      height: 630,
      checksum: ogWebpChecksum,
      prompt: `OG WebP for ${collection.title}`,
      validationStatus: "valid",
      metadataJson: {
        fileType: "webp",
        contentType: "image/webp",
        storageKey: ogWebpObject.key,
        byteSize: ogWebpObject.byteSize,
        sourceAssetId: ogAssetId
      },
      createdAt: now
    });
    const ogImage: OgImage = {
      id: newId("og"),
      collectionId,
      assetId: ogAsset.id,
      imageUrl: ogAsset.url,
      title: collection.title,
      subtitle: collection.subtitle,
      prompt: ogPrompt,
      compositionJson: { relicIds: relics.map((relic) => relic.id), collectionType: "drop", sourceLifestyleImageUrls: lifestyleImageUrls },
      status: manuallyGeneratedImages ? "manual_pending" : "ready",
      createdAt: now
    };
    collection.ogImageId = ogImage.id;
    await event(storefrontId, manuallyGeneratedImages ? "manual_og_prompt_ready" : "og_generation_succeeded", manuallyGeneratedImages ? "AWAITING_MANUAL_IMAGES" : "OG_READY", traceId, manuallyGeneratedImages ? "Manual OG image prompt is ready for admin upload." : "OG image generated.", {
      ogImageUrl: ogAsset.url,
      ogWebpUrl: ogWebpObject.url,
      width: 1200,
      height: 630,
      relicIds: relics.map((relic) => relic.id)
    }, job.id);

    const editions: RelicEdition[] = relics.flatMap((relic) =>
      Array.from({ length: 8 }, (_, index) => ({
        id: newId("ed"),
        dropId,
        relicId: relic.id,
        editionNumber: index + 1,
        globalEditionNumber: (Number(relic.relicIndex || 1) - 1) * 8 + index + 1,
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

    collection.status = "ready_for_review";
    storefront.status = "summoned";
    storefront.generationStatus = manuallyGeneratedImages ? "AWAITING_MANUAL_IMAGES" : "READY_FOR_REVIEW";
    const adminReview: AdminReview = {
      id: newId("review"),
      storefrontId,
      collectionId,
      status: "pending",
      checklistJson: {
        urlCrawled: true,
        brandStudyGenerated: true,
        relicPlanValid: true,
        relicPlanCritiqued: true,
        printfulVariantSelected: true,
        printFilesGenerated: true,
        printFilesValid: !manuallyGeneratedImages,
        lifestyleImagesGenerated: true,
        lifestyleImagesValid: !manuallyGeneratedImages,
        mockupsGenerated: !manuallyGeneratedImages,
        ogGenerated: !manuallyGeneratedImages,
        editionsCreated: true,
        pricesMarginsValid: true,
        productValidationStatus: productValidation.status,
        productValidationBlockingErrors: String(productValidation.blocking_errors.length),
        productValidationWarnings: String(productValidation.warnings.length),
        checkoutReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCKS === "true"),
        fulfillmentReady: Boolean(process.env.PRINTFUL_API_KEY || process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCKS === "true"),
        hermesCritique: relicCritique
      },
      notes: relicCritique,
      createdAt: now,
      updatedAt: now
    };
    job.status = "completed";
    job.currentStep = manuallyGeneratedImages ? "AWAITING_MANUAL_IMAGES" : "READY_FOR_REVIEW";
    job.updatedAt = now;

    const bundle = await saveGeneratedBundle({
      brand,
      drop,
      storefront,
      sourceSignals,
      snapshot,
      study: brandStudy,
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
    await recordEvent({
      entityType: "storefront",
      entityId: storefrontId,
      eventType: "ready_for_review",
      level: "info",
      message: "Storefront is ready for admin review.",
      metadataJson: { slug, relicCount },
      requestId: null,
      traceId
    });
    return bundle;
  } catch (error) {
    if (job.id) await updateGenerationJobStep(job.id, "FAILED", error instanceof Error ? error.message : "Generation failed.");
    await updateGenerationStep(storefrontId, "FAILED", error instanceof Error ? error.message : "Generation failed.");
    await recordEvent({
      entityType: "storefront",
      entityId: storefrontId,
      eventType: "generation_failed",
      level: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
      metadataJson: { url: canonicalUrl },
      requestId: null,
      traceId
    });
    throw error;
  }
}
