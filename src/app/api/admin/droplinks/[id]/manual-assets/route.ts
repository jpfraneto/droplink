import { createHash } from "crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { newId } from "@/lib/hashes";
import { redirectTo } from "@/lib/redirects";
import { getDropBundleByDropId, recordEvent, updateManualOgImage, updateManualRelicArtwork } from "@/lib/store";
import { putStoredObject } from "@/lib/storage";
import type { Asset, OgImage } from "@/lib/types";

function checksum(input: Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

async function fileBuffer(file: File) {
  if (!file || !file.size) throw new Error("Choose an image file.");
  if (!file.type.startsWith("image/")) throw new Error("Manual asset upload must be an image.");
  return Buffer.from(await file.arrayBuffer());
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const bundle = await getDropBundleByDropId(params.id);
    if (!bundle?.drop || !bundle.activeCollection) throw new Error("DropLink not found.");

    const form = await request.formData();
    const kind = String(form.get("kind") || "");
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
        printFileSha256: printSha
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
      return redirectTo(request, `/admin?storefront=${bundle.storefront.id}`);
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
      return redirectTo(request, `/admin?storefront=${bundle.storefront.id}`);
    }

    throw new Error("Manual asset kind must be relic or og.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual asset upload failed.";
    return redirectTo(request, `/admin?error=${encodeURIComponent(message)}`);
  }
}
