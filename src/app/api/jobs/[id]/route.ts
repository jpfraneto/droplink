import { NextResponse } from "next/server";
import { getGenerationJob, getStorefrontBundleById, listSystemEventsByTraceId } from "@/lib/store";

function compactMetadata(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!input) return null;
  const keep = new Set([
    "submittedUrl",
    "canonicalUrl",
    "canonicalRootDomain",
    "finalUrl",
    "title",
    "description",
    "headings",
    "discoveredLinks",
    "visualEvidence",
    "strongVisualReferences",
    "repeatedPhrases",
    "socialLinks",
    "topVisualEvidence",
    "textSignals",
    "brandName",
    "archetype",
    "essence",
    "hiddenWorld",
    "buyerRole",
    "emotionalContract",
    "core",
    "narrativeSeed",
    "worldview",
    "skill",
    "doctrineVersion",
    "agentRuntime",
    "contract",
    "visualDna",
    "motifs",
    "palette",
    "avoid",
    "collectionTitle",
    "collectionSubtitle",
    "dropConcept",
    "dropLore",
    "relics",
    "relicId",
    "relicIndex",
    "relicName",
    "productName",
    "variantName",
    "role",
    "artDirection",
    "selectionReason",
    "printFileUrl",
    "previewUrl",
    "printArtPreviewUrl",
    "lifestyleImageUrl",
    "mockupImageUrl",
    "ogImageUrl",
    "ogWebpUrl",
    "imageRole",
    "validationStatus",
    "status",
    "ready",
    "total",
    "reason",
    "fallbackPreviewUrl"
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!keep.has(key)) continue;
    if (typeof value === "string") out[key] = value.length > 900 ? `${value.slice(0, 900)}…` : value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 8);
    else if (value && typeof value === "object") out[key] = value;
    else out[key] = value;
  }
  return out;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getGenerationJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const bundle = job.storefrontId ? await getStorefrontBundleById(job.storefrontId) : null;
  const events = job.traceId ? (await listSystemEventsByTraceId(job.traceId)).map((event) => ({
    ...event,
    metadataJson: compactMetadata(event.metadataJson)
  })) : [];
  const scoutBundle = bundle
    ? {
        brand: {
          name: bundle.brand.name,
          hostname: bundle.brand.hostname,
          slug: bundle.brand.slug
        },
        storefront: bundle.storefront,
        drop: bundle.drop
          ? {
              id: bundle.drop.id,
              canonicalUrl: bundle.drop.canonicalUrl,
              canonicalRootDomain: bundle.drop.canonicalRootDomain,
              status: bundle.drop.status,
              domainClaimStatus: bundle.drop.domainClaimStatus,
              publishStatus: bundle.drop.publishStatus
            }
          : null,
        activeCollection: bundle.activeCollection,
        brandStudy: bundle.brandStudy,
        relicPlan: bundle.relicPlan,
        relics: bundle.relics,
        ogImage: bundle.ogImage
          ? {
              imageUrl: bundle.ogImage.imageUrl,
              title: bundle.ogImage.title,
              subtitle: bundle.ogImage.subtitle,
              status: bundle.ogImage.status
            }
          : null
      }
    : null;
  return NextResponse.json({
    now: new Date().toISOString(),
    job,
    storefront: bundle?.storefront || null,
    bundle: scoutBundle,
    events
  });
}
