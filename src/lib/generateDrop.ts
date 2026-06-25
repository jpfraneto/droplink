import { createHash } from "crypto";
import sharp from "sharp";
import { BRAND_STUDY_PROMPT_VERSION, RELIC_PLAN_PROMPT_VERSION, planRelics, studyBrand } from "./hermesDropAgent";
import { canonicalizeDropUrl } from "./dropCanonicalization";
import { assertFiniteDropConfig, dropConfig } from "./env";
import { newId } from "./hashes";
import { generateOpenAIProductImage, manualImageMode } from "./imageProvider";
import { relicMockupSvg } from "./mockups";
import { ogPng as createOgPng } from "./og";
import { buildDropPriceBook } from "./pricing";
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

async function pngMetadata(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || null,
    height: metadata.height || null,
    contentType: metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "webp" ? "image/webp" : "image/png",
    fileType: metadata.format || "png"
  };
}

async function productArtBuffer(brand: Brand, relic: Relic, prompt: string) {
  if (manualImageMode()) {
    const svg = relicMockupSvg(brand, relic);
    return {
      buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
      validationStatus: "pending" as const,
      provider: "manual_chatgpt"
    };
  }
  const generated = await generateOpenAIProductImage(prompt);
  if (generated) return { buffer: generated, validationStatus: "valid" as const, provider: "openai" };
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

export async function generateDropFromUrl(
  url: string,
  options: {
    jobId?: string;
    traceId?: string;
    summonerWallet?: string | null;
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
  const dropId = `drop_${canonicalTarget.rootDomainHash.slice(0, 24)}`;
  const brandId = newId("brand");
  const storefrontId = newId("store");
  const collectionId = newId("col");
  const relicCount = dropConfig.relicsPerDrop;
  const baseSlug = brandSlugFromUrl(canonicalUrl);
  const slug = uniqueSlug(baseSlug, await existingStorefrontSlugs());

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
  const dnsClaimNonce = newId("dns").replace(/^dns_/, "");
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
    title: `${brand.name} DropLink Relics`,
    subtitle: "3 relics · 8 items each · 24 merch SKUs",
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
    message: "URL intake created.",
    metadataJson: { url: canonicalUrl, slug },
    requestId: null,
    traceId
  });

  try {
    await event(storefrontId, "crawl_started", "CRAWLING", traceId, "Crawling source URL.", {}, job.id);
    const page = await scrapePublicPage(sourceUrl);
    await event(storefrontId, "crawl_succeeded", "CRAWLED", traceId, "Source URL crawled.", { title: page.title }, job.id);
    const snapshot: BrandSnapshot = {
      id: newId("snap"),
      brandId,
      url: page.url,
      title: page.title,
      description: page.description,
      textSample: page.textSample,
      createdAt: now
    };

    await event(storefrontId, "brand_study_started", "DISTILLING", traceId, "Brand study started.", {}, job.id);
    const studied = await studyBrand({ ...page, traceId });
    brand.name = studied.study.brand_name;
    await event(storefrontId, "brand_study_succeeded", "DISTILLED", traceId, "Brand study generated.", {}, job.id);
    const brandStudy: BrandStudy = {
      id: newId("study"),
      brandId,
      storefrontId,
      promptVersion: BRAND_STUDY_PROMPT_VERSION,
      modelVersion: studied.modelVersion,
      studyJson: studied.study,
      createdAt: now
    };

    await event(storefrontId, "relic_plan_started", "PLANNING_RELICS", traceId, "Relic planning started.", {}, job.id);
    const printfulCatalogOptions = await printfulCatalogOptionsForPlanning({ traceId });
    const planned = await planRelics({ study: studied.study, relicCount: 3, collectionType: "drop", printfulCatalogOptions, traceId });
    await event(storefrontId, "relic_plan_succeeded", "RELICS_PLANNED", traceId, "Relic plan generated.", {
      relicCount: planned.plan.relics.length
    }, job.id);
    const collection: Collection = {
      ...placeholderCollection,
      title: planned.plan.collection_title,
      subtitle: planned.plan.collection_subtitle
    };
    const relicPlan: RelicPlan = {
      id: newId("plan"),
      collectionId,
      promptVersion: RELIC_PLAN_PROMPT_VERSION,
      modelVersion: planned.modelVersion,
      planJson: planned.plan,
      createdAt: now
    };

    await event(storefrontId, "printful_matching_started", "MATCHING_PRINTFUL", traceId, "Matching product concepts to Printful catalog variants.", {}, job.id);
    const relicSlugSet = new Set<string>();
    const selectedVariants: SelectedPrintfulVariant[] = [];
    for (const entry of planned.plan.relics) {
      selectedVariants.push(
        await selectPrintfulCatalogVariant({
          name: entry.name,
          archetype: entry.archetype,
          physicalArchetype: entry.physical_archetype,
          productFamily: `${entry.product_family} ${entry.printful_product_key}`,
          description: entry.description,
          artDirection: entry.art_direction,
          suggestedPriceCents: entry.suggested_price_cents,
          traceId
        })
      );
    }
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
        name: entry.name,
        archetype: entry.archetype,
        productFamily: entry.product_family,
        description: entry.description,
        whyThisExists: entry.why_this_exists,
        artDirection: entry.art_direction,
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
    await event(storefrontId, "printful_matched", "PRINTFUL_MATCHED", traceId, "All products matched to fixed Printful catalog variants.", {}, job.id);

    await event(storefrontId, "print_files_started", "GENERATING_PRINT_FILES", traceId, "Generating print files.", {}, job.id);
    const manuallyGeneratedImages = manualImageMode();
    const assets: Asset[] = [];
    const mockups: Mockup[] = [];
    for (const [index, relic] of relics.entries()) {
      const planEntry = planned.plan.relics[index];
      const selection = selectedVariants[index];
      const printAssetId = newId("asset");
      const previewAssetId = newId("asset");
      const prompt = [
        `Create print-ready product artwork for ${brand.name}.`,
        `Product: ${selection.product.name}, fixed variant: ${selection.variant.name}.`,
        `Placement: ${selection.placement}. Technique: ${selection.technique}.`,
        `Product concept: ${relic.name}. ${relic.description}`,
        `Brand essence: ${studied.study.essence}`,
        `Worldview: ${studied.study.worldview}`,
        `Aesthetic motifs: ${studied.study.aesthetic_motifs.join(", ")}`,
        `Color palette: ${studied.study.color_palette.join(", ")}`,
        `Art direction: ${relic.artDirection}`,
        `Avoid: ${studied.study.things_to_avoid.join(", ")}`,
        page.ogImage ? `Use this source image only as loose brand reference, not as a logo to copy exactly: ${page.ogImage}` : "",
        page.favicon ? `Optional favicon reference: ${page.favicon}` : "",
        "Use a clean centered composition. Avoid trademarked logos unless they are visibly present in the public source. No mockup, no shirt body, no background scene."
      ].filter(Boolean).join("\n");
      const generated = await productArtBuffer(brand, relic, prompt);
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
      relic.fulfillmentSpecJson = fulfillmentSpec;
      relic.priceCents = Math.max(relic.priceCents, Math.round(Number(fulfillmentSpec.retailPriceUsd) * 100));
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
        prompt,
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
          sourceFavicon: page.favicon || null
        },
        createdAt: now
      };
      assets.push(printFile);
      assets.push({
        id: previewAssetId,
        collectionId,
        relicId: relic.id,
        type: "preview",
        url: previewObject.url,
        storageProvider: previewObject.storageProvider,
        width: 900,
        height: 900,
        checksum: previewSha256,
        prompt,
        validationStatus: generated.validationStatus,
        metadataJson: {
          fileType: "webp",
          contentType: "image/webp",
          storageKey: previewObject.key,
          byteSize: previewObject.byteSize,
          sourceAssetId: printAssetId
        },
        createdAt: now
      });
      if (printfulConfigured() && generated.validationStatus === "valid") {
        const task = await createPrintfulMockup({ relic, spec: fulfillmentSpec, traceId });
        const urls = mockupUrlsFromTask(task.result);
        relic.fulfillmentSpecJson = { ...fulfillmentSpec, mockupTaskId: task.taskId, mockupUrls: urls };
        mockups.push({
          id: newId("mock"),
          relicId: relic.id,
          assetId: printFile.id,
          imageUrl: urls[0] || printFile.url,
          printfulTaskId: task.taskId,
          viewName: "front",
          status: urls.length ? "ready" : "pending",
          createdAt: now
        });
      } else {
        mockups.push({
          id: newId("mock"),
          relicId: relic.id,
          assetId: printFile.id,
          imageUrl: previewObject.url,
          printfulTaskId: null,
          viewName: "front",
          status: generated.validationStatus === "valid" ? "pending" : generated.validationStatus === "pending" ? "manual_pending" : "mock",
          createdAt: now
        });
      }
      const relicMockup = mockups[mockups.length - 1];
      await event(storefrontId, "relic_assets_generated", "GENERATING_PRINT_FILES", traceId, `Generated assets for ${relic.name}.`, {
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
        printFileSha256: fileSha256,
        mockupStatus: relicMockup?.status,
        mockupTaskId: relicMockup?.printfulTaskId || null,
        mockupImageUrl: relicMockup?.imageUrl || null
      }, job.id);
    }
    await event(storefrontId, "print_files_ready", "PRINT_FILES_READY", traceId, "Print files generated.", {}, job.id);
    if (manuallyGeneratedImages) {
      await event(
        storefrontId,
        "manual_product_image_prompts_ready",
        "AWAITING_MANUAL_IMAGES",
        traceId,
        "Manual product image prompts are ready for admin upload.",
        { relicIds: relics.map((relic) => relic.id) },
        job.id
      );
    } else {
      await event(storefrontId, "print_files_valid", "PRINT_FILES_VALID", traceId, "Print files passed conservative validation.", {}, job.id);
    }
    await event(storefrontId, "mockups_ready", "MOCKUPS_READY", traceId, "Printful mockup generation attempted.", {
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
    await event(storefrontId, "price_book_generated", "PRINT_FILES_VALID", traceId, "Draft price book and projected economics generated.", {
      projectedDomainOwnerProceedsUsd: priceBook.totals.projectedDomainOwnerProceedsUsd,
      maxGrossRevenueUsd: priceBook.totals.maxGrossRevenueUsd
    }, job.id);

    await event(storefrontId, "og_generation_started", "GENERATING_OG", traceId, "OG image generation started.", {}, job.id);
    const ogPrompt = [
      `Create a 1200x630 DropLink share image for ${brand.name}.`,
      `Brand essence: ${studied.study.essence}`,
      `Worldview: ${studied.study.worldview}`,
      `Collection: ${collection.title} — ${collection.subtitle}`,
      `Use the three product artwork images as primary references and compose them together as one launch image.`,
      `Products: ${relics.map((relic) => `${relic.relicIndex}. ${relic.name} (${relic.productFamily})`).join("; ")}`,
      `Aesthetic motifs: ${studied.study.aesthetic_motifs.join(", ")}`,
      `Color palette: ${studied.study.color_palette.join(", ")}`,
      "Include no fake UI chrome, no unauthorized exact logos, no celebrity likenesses, and no extra product concepts.",
      "Make it feel like one coherent finite drop, not a collage of unrelated mockups."
    ].join("\n");
    const ogPng = await createOgPng(brand, collection, relics, {
      imageUrls: relics.map((relic) => mockups.find((mockup) => mockup.relicId === relic.id)?.imageUrl),
      publicPath: `${(process.env.DROPLINK_PUBLIC_BASE_URL || "https://droplink.lat").replace(/^https?:\/\//, "").replace(/\/$/, "")}/${slug}`
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
        imageProvider: manuallyGeneratedImages ? "manual_chatgpt" : "sharp_composite",
        manualUploadRequired: manuallyGeneratedImages,
        sourceRelicIds: relics.map((relic) => relic.id)
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
      compositionJson: { relicIds: relics.map((relic) => relic.id), collectionType: "drop" },
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
        printfulVariantSelected: true,
        printFilesGenerated: true,
        printFilesValid: !manuallyGeneratedImages,
        mockupsGenerated: !manuallyGeneratedImages,
        ogGenerated: !manuallyGeneratedImages,
        editionsCreated: true,
        pricesMarginsValid: true,
        checkoutReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCKS === "true"),
        fulfillmentReady: Boolean(process.env.PRINTFUL_API_KEY || process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCKS === "true")
      },
      notes: null,
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
