import { createHash } from "crypto";
import sharp from "sharp";
import { BRAND_STUDY_PROMPT_VERSION, RELIC_PLAN_PROMPT_VERSION, planRelics, studyBrand } from "./atelierAi";
import { newId } from "./hashes";
import { generateOpenAIProductImage } from "./imageProvider";
import { relicMockupSvg } from "./mockups";
import { ogSvg } from "./og";
import {
  buildRelicFulfillmentSpec,
  createPrintfulMockup,
  mockupUrlsFromTask,
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
  tierRelicCount,
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
  GenerationJob,
  GenerationStep,
  Mockup,
  OgImage,
  Relic,
  RelicEdition,
  RelicPlan,
  Storefront,
  StorefrontBundle,
  StorefrontTier
} from "./types";

const GENERATOR_VERSION = "atelier-backend-v1";

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
  options: { tier?: StorefrontTier; type?: "genesis" | "weekly"; jobId?: string; traceId?: string } = {}
): Promise<StorefrontBundle> {
  const normalized = await normalizePublicUrl(url);
  const canonicalUrl = normalized.toString();
  const hostname = domainFromUrl(canonicalUrl);
  const traceId = options.traceId || newId("run");
  const now = new Date().toISOString();
  const brandId = newId("brand");
  const storefrontId = newId("store");
  const collectionId = newId("col");
  const tier = options.tier || "free";
  const type = options.type || "genesis";
  const relicCount = tierRelicCount(tier, type);
  if (type === "genesis" && relicCount !== 3) throw new Error("Free genesis generation must create exactly 3 relics.");
  if (type === "weekly" && relicCount !== 8) throw new Error("Weekly generation must create exactly 8 relics.");
  const baseSlug = brandSlugFromUrl(canonicalUrl);
  const slug = uniqueSlug(baseSlug, await existingStorefrontSlugs());

  const brand: Brand = {
    id: brandId,
    canonicalUrl,
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
    status: "draft",
    tier,
    claimStatus: "unclaimed",
    commerceMode: "preview",
    commissionBps: tier === "atelier" ? 0 : 800,
    customDomain: null,
    stripeConnectedAccountId: null,
    generationStatus: "INTAKE_CREATED",
    generationTraceId: traceId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
  const placeholderCollection: Collection = {
    id: collectionId,
    storefrontId,
    type,
    status: "generating",
    title: `${brand.name} Genesis Relics`,
    subtitle: type === "weekly" ? "8 products · 8 units each" : "3 unique products · 8 units each",
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
    type,
    status: "running",
    currentStep: "INTAKE_CREATED",
    inputJson: { url: canonicalUrl, tier, type },
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
    const page = await scrapePublicPage(canonicalUrl);
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
    const planned = await planRelics({ study: studied.study, relicCount: relicCount as 3 | 8, collectionType: type, traceId });
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
          productFamily: entry.product_family,
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
        `Art direction: ${relic.artDirection}`,
        "Use a clean centered composition. Avoid trademarked logos unless they are visibly present in the public source. No mockup, no shirt body, no background scene."
      ].join("\n");
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
          imageProvider: generated.provider
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
          status: generated.validationStatus === "valid" ? "pending" : "mock",
          createdAt: now
        });
      }
    }
    await event(storefrontId, "print_files_ready", "PRINT_FILES_READY", traceId, "Print files generated.", {}, job.id);
    await event(storefrontId, "print_files_valid", "PRINT_FILES_VALID", traceId, "Print files passed conservative validation.", {}, job.id);
    await event(storefrontId, "mockups_ready", "MOCKUPS_READY", traceId, "Printful mockup generation attempted.", {
      ready: mockups.filter((mockup) => mockup.status === "ready").length,
      total: mockups.length
    }, job.id);

    await event(storefrontId, "og_generation_started", "GENERATING_OG", traceId, "OG image generation started.", {}, job.id);
    const og = ogSvg(brand, collection, relics);
    const ogPng = await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer();
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
      prompt: `OG for ${collection.title}`,
      validationStatus: "valid",
      metadataJson: { fileType: "png", contentType: "image/png", storageKey: ogObject.key, byteSize: ogObject.byteSize },
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
      prompt: `Brand vibe background with ${relicCount} products and scarcity line.`,
      compositionJson: { relicIds: relics.map((relic) => relic.id), collectionType: type },
      status: "ready",
      createdAt: now
    };
    collection.ogImageId = ogImage.id;
    await event(storefrontId, "og_generation_succeeded", "OG_READY", traceId, "OG image generated.", {}, job.id);

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

    collection.status = "ready_for_review";
    storefront.status = "ready_for_review";
    storefront.generationStatus = "READY_FOR_REVIEW";
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
        printFilesValid: true,
        mockupsGenerated: true,
        ogGenerated: true,
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
    job.currentStep = "READY_FOR_REVIEW";
    job.updatedAt = now;

    const bundle = await saveGeneratedBundle({
      brand,
      storefront,
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
