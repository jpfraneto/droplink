import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { redirectTo } from "@/lib/redirects";
import { archiveStorefront, getDropBundleByDropId, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const bundle = await getDropBundleByDropId(params.id);
  if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
  await archiveStorefront(bundle.storefront.id);
  await recordEvent({
    entityType: "drop",
    entityId: params.id,
    eventType: "admin_archived",
    level: "info",
    message: "Admin archived DropLink.",
    metadataJson: { slug: bundle.storefront.slug },
    requestId: request.headers.get("x-request-id"),
    traceId: bundle.storefront.generationTraceId || null
  });
  return redirectTo(request, `/admin?storefront=${bundle.storefront.id}`);
}
