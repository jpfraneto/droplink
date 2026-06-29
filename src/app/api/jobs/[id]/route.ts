import { NextResponse } from "next/server";
import { getGenerationJob, getStorefrontBundleById, listSystemEventsByTraceId } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getGenerationJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const bundle = job.storefrontId ? await getStorefrontBundleById(job.storefrontId) : null;
  const events = job.traceId ? await listSystemEventsByTraceId(job.traceId) : [];
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
