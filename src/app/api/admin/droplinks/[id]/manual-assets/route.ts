import { createHash } from "crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { newId } from "@/lib/hashes";
import { printfulCatalogImageUrl } from "@/lib/printfulReferences";
import { redirectTo } from "@/lib/redirects";
import { clearManualAsset, getDropBundleByDropId, recordEvent, updateManualOgImage, updateManualRelicArtwork, updateManualRelicLifestyleImage } from "@/lib/store";
import { putStoredObject } from "@/lib/storage";
import type { Asset, OgImage, Relic } from "@/lib/types";

const maxManualUploadBytes = 12 * 1024 * 1024;

function checksum(input: Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

async function fileBuffer(file: File) {
  if (!file || !file.size) throw new Error("Choose an image file.");
  if (!file.type.startsWith("image/")) throw new Error("Manual asset upload must be an image.");
  if (file.size > maxManualUploadBytes) throw new Error("Manual image uploads must be 12MB or smaller.");
  return Buffer.from(await file.arrayBuffer());
}

function returnPath(request: Request, bundle: { storefront: { slug: string } }) {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.pathname.startsWith("/admin/")) return `${url.pathname}${url.search}`;
    } catch {
      // Ignore malformed referers.
    }
  }
  return `/admin/${bundle.storefront.slug}`;
}

function refreshedLifestylePrompt(input: {
  brandName: string;
  relic: Relic;
  artworkUrl: string;
  existingPrompt?: string | null;
  printfulProductImageUrl?: string | null;
}) {
  return [
    `Create a catchy editorial product-in-use image for ${input.brandName}.`,
    `Use this uploaded DropLink print artwork as the exact design on the product: ${input.artworkUrl}`,
    input.printfulProductImageUrl
      ? `Use this selected Printful catalog item image as the base product silhouette, color, and proportions: ${input.printfulProductImageUrl}`
      : "",
    `Product: ${input.relic.fulfillmentSpecJson?.productName || input.relic.productFamily}, fixed variant: ${input.relic.fulfillmentSpecJson?.variantName || input.relic.printfulVariantId || "selected variant"}.`,
    `Relic: ${input.relic.name}. ${input.relic.description}`,
    "The uploaded artwork URL above is authoritative. Ignore any older artwork URL if it appears below.",
    "Make the final image feel real, inspectable, and usable as the catchy product image: clear product visibility, believable human scale, no fake UI chrome.",
    "Do not invent extra products, do not render a different design, and do not copy unauthorized exact logos.",
    input.existingPrompt ? `Original pipeline context:\n${input.existingPrompt}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const bundle = await getDropBundleByDropId(params.id);
    if (!bundle?.drop || !bundle.activeCollection) throw new Error("DropLink not found.");

    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const action = String(form.get("action") || "upload");
    const redirectPath = returnPath(request, bundle);
    if (action === "delete") {
      const relicId = String(form.get("relicId") || "");
      if ((kind === "relic" || kind === "lifestyle") && !bundle.relics.some((entry) => entry.id === relicId)) throw new Error("Relic not found.");
      await clearManualAsset({
        dropId: bundle.drop.id,
        kind: kind === "relic" || kind === "lifestyle" || kind === "og" ? kind : "relic",
        relicId: relicId || null
      });
      await recordEvent({
        entityType: "storefront",
        entityId: bundle.storefront.id,
        eventType: "manual_asset_deleted",
        level: "info",
        message: `Manual ${kind} image cleared.`,
        metadataJson: { relicId: relicId || null, kind },
        requestId: request.headers.get("x-request-id"),
        traceId: bundle.storefront.generationTraceId || null
      });
      return redirectTo(request, redirectPath);
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose an image file.");
    const input = await fileBuffer(file);
    const now = new Date().toISOString();

    if (kind === "relic") {
      const relicId = String(form.get("relicId") || "");
      const relic = bundle.relics.find((entry) => entry.id === relicId);
      if (!relic) throw new Error("Relic not found.");
      const existingPrint = bundle.assets.find((asset) => asset.relicId === relic.id && asset.type === "print_file");
      const existingPreview = bundle.assets.find((asset) => asset.relicId === relic.id && asset.type === "preview");
      const existingLifestyle = bundle.assets.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle");
      const existingMockup = bundle.mockups.find((mockup) => mockup.relicId === relic.id);
      const normalizedPng = await sharp(input).png({ compressionLevel: 9 }).toBuffer();
      const previewWebp = await sharp(normalizedPng)
        .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const metadata = await sharp(normalizedPng).metadata();
      const printSha = checksum(normalizedPng);
      const previewSha = checksum(previewWebp);
      const printObject = await putStoredObject({
        key: `collections/${bundle.activeCollection.id}/relics/${relic.id}/manual-print-${printSha.slice(0, 16)}.png`,
        body: normalizedPng,
        contentType: "image/png"
      });
      const previewObject = await putStoredObject({
        key: `collections/${bundle.activeCollection.id}/relics/${relic.id}/manual-preview-${previewSha.slice(0, 16)}.webp`,
        body: previewWebp,
        contentType: "image/webp"
      });
      const prompt = existingPrint?.prompt || null;
      const printfulProductImageUrl = printfulCatalogImageUrl(relic.fulfillmentSpecJson?.rawPrintfulCatalogSnapshotJson);
      const lifestylePrompt = refreshedLifestylePrompt({
        brandName: bundle.brand.name,
        relic,
        artworkUrl: printObject.url,
        existingPrompt: existingLifestyle?.prompt,
        printfulProductImageUrl
      });
      const printAsset: Asset = {
        id: existingPrint?.id || newId("asset"),
        collectionId: bundle.activeCollection.id,
        relicId: relic.id,
        type: "print_file",
        url: printObject.url,
        storageProvider: printObject.storageProvider,
        width: metadata.width || null,
        height: metadata.height || null,
        checksum: printSha,
        prompt,
        validationStatus: "valid",
        metadataJson: {
          ...(existingPrint?.metadataJson || {}),
          fileType: "png",
          contentType: "image/png",
          storageKey: printObject.key,
          byteSize: printObject.byteSize,
          imageProvider: "manual_chatgpt",
          manualUploadRequired: false,
          uploadedAt: now
        },
        createdAt: existingPrint?.createdAt || now
      };
      const previewAsset: Asset = {
        id: existingPreview?.id || newId("asset"),
        collectionId: bundle.activeCollection.id,
        relicId: relic.id,
        type: "preview",
        url: previewObject.url,
        storageProvider: previewObject.storageProvider,
        width: 900,
        height: 900,
        checksum: previewSha,
        prompt,
        validationStatus: "valid",
        metadataJson: {
          ...(existingPreview?.metadataJson || {}),
          fileType: "webp",
          contentType: "image/webp",
          storageKey: previewObject.key,
          byteSize: previewObject.byteSize,
          sourceAssetId: printAsset.id,
          imageProvider: "manual_chatgpt",
          manualUploadRequired: false,
          uploadedAt: now
        },
        createdAt: existingPreview?.createdAt || now
      };
      await updateManualRelicArtwork({
        dropId: bundle.drop.id,
        relicId: relic.id,
        printAsset,
        previewAsset,
        mockupId: existingMockup?.id || newId("mock"),
        mockupImageUrl: previewObject.url,
        printFileUrl: printObject.url,
        printFileSha256: printSha,
        lifestylePrompt,
        lifestyleMetadataJson: {
          sourceUploadedPrintFileUrl: printObject.url,
          sourceUploadedPreviewUrl: previewObject.url,
          printfulProductImageUrl,
          lifestylePromptRefreshedAt: now
        }
      });
      await recordEvent({
        entityType: "storefront",
        entityId: bundle.storefront.id,
        eventType: "manual_relic_image_uploaded",
        level: "info",
        message: `Manual image uploaded for ${relic.name}.`,
        metadataJson: { relicId: relic.id, printFileUrl: printObject.url, previewUrl: previewObject.url },
        requestId: request.headers.get("x-request-id"),
        traceId: bundle.storefront.generationTraceId || null
      });
      return redirectTo(request, redirectPath);
    }

    if (kind === "lifestyle") {
      const relicId = String(form.get("relicId") || "");
      const relic = bundle.relics.find((entry) => entry.id === relicId);
      if (!relic) throw new Error("Relic not found.");
      const existingLifestyle = bundle.assets.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle");
      const normalizedPng = await sharp(input).resize(1200, 1200, { fit: "cover" }).png({ compressionLevel: 9 }).toBuffer();
      const metadata = await sharp(normalizedPng).metadata();
      const sha = checksum(normalizedPng);
      const stored = await putStoredObject({
        key: `collections/${bundle.activeCollection.id}/relics/${relic.id}/manual-lifestyle-${sha.slice(0, 16)}.png`,
        body: normalizedPng,
        contentType: "image/png"
      });
      const lifestyleAsset: Asset = {
        id: existingLifestyle?.id || newId("asset"),
        collectionId: bundle.activeCollection.id,
        relicId: relic.id,
        type: "lifestyle",
        url: stored.url,
        storageProvider: stored.storageProvider,
        width: metadata.width || 1200,
        height: metadata.height || 1200,
        checksum: sha,
        prompt: existingLifestyle?.prompt || null,
        validationStatus: "valid",
        metadataJson: {
          ...(existingLifestyle?.metadataJson || {}),
          fileType: "png",
          contentType: "image/png",
          storageKey: stored.key,
          byteSize: stored.byteSize,
          imageProvider: "manual_chatgpt",
          manualUploadRequired: false,
          uploadedAt: now
        },
        createdAt: existingLifestyle?.createdAt || now
      };
      await updateManualRelicLifestyleImage({
        dropId: bundle.drop.id,
        collectionId: bundle.activeCollection.id,
        relicId: relic.id,
        lifestyleAsset
      });
      await recordEvent({
        entityType: "storefront",
        entityId: bundle.storefront.id,
        eventType: "manual_lifestyle_image_uploaded",
        level: "info",
        message: `Manual product-in-use image uploaded for ${relic.name}.`,
        metadataJson: { relicId: relic.id, lifestyleImageUrl: stored.url },
        requestId: request.headers.get("x-request-id"),
        traceId: bundle.storefront.generationTraceId || null
      });
      return redirectTo(request, redirectPath);
    }

    if (kind === "og") {
      const existingAsset = bundle.ogImage?.assetId ? bundle.assets.find((asset) => asset.id === bundle.ogImage?.assetId) : bundle.assets.find((asset) => asset.type === "og");
      const normalizedPng = await sharp(input).resize(1200, 630, { fit: "cover" }).png({ compressionLevel: 9 }).toBuffer();
      const sha = checksum(normalizedPng);
      const stored = await putStoredObject({
        key: `collections/${bundle.activeCollection.id}/manual-og-${sha.slice(0, 16)}.png`,
        body: normalizedPng,
        contentType: "image/png"
      });
      const asset: Asset = {
        id: existingAsset?.id || newId("asset"),
        collectionId: bundle.activeCollection.id,
        relicId: null,
        type: "og",
        url: stored.url,
        storageProvider: stored.storageProvider,
        width: 1200,
        height: 630,
        checksum: sha,
        prompt: bundle.ogImage?.prompt || existingAsset?.prompt || `OG for ${bundle.activeCollection.title}`,
        validationStatus: "valid",
        metadataJson: {
          ...(existingAsset?.metadataJson || {}),
          fileType: "png",
          contentType: "image/png",
          storageKey: stored.key,
          byteSize: stored.byteSize,
          imageProvider: "manual_chatgpt",
          manualUploadRequired: false,
          uploadedAt: now
        },
        createdAt: existingAsset?.createdAt || now
      };
      const ogImage: OgImage = {
        id: bundle.ogImage?.id || newId("og"),
        collectionId: bundle.activeCollection.id,
        assetId: asset.id,
        imageUrl: stored.url,
        title: bundle.activeCollection.title,
        subtitle: bundle.activeCollection.subtitle,
        prompt: asset.prompt || `OG for ${bundle.activeCollection.title}`,
        compositionJson: {
          ...(bundle.ogImage?.compositionJson || {}),
          manualUpload: true,
          relicIds: bundle.relics.map((relic) => relic.id)
        },
        status: "ready",
        createdAt: bundle.ogImage?.createdAt || now
      };
      await updateManualOgImage({
        dropId: bundle.drop.id,
        collectionId: bundle.activeCollection.id,
        asset,
        ogImage
      });
      await recordEvent({
        entityType: "storefront",
        entityId: bundle.storefront.id,
        eventType: "manual_og_image_uploaded",
        level: "info",
        message: "Manual OG image uploaded.",
        metadataJson: { ogImageUrl: stored.url },
        requestId: request.headers.get("x-request-id"),
        traceId: bundle.storefront.generationTraceId || null
      });
      return redirectTo(request, redirectPath);
    }

    throw new Error("Manual asset kind must be relic, lifestyle, or og.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual asset upload failed.";
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const url = new URL(referer);
        if (url.pathname.startsWith("/admin/")) return redirectTo(request, `${url.pathname}${url.search ? `${url.search}&` : "?"}error=${encodeURIComponent(message)}`);
      } catch {
        // Ignore malformed referers.
      }
    }
    return redirectTo(request, `/admin?error=${encodeURIComponent(message)}`);
  }
}
