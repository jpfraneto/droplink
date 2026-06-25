import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { redirectTo } from "@/lib/redirects";
import { getDropBundleByDropId, publishStorefront, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const current = await getDropBundleByDropId(params.id);
    if (!current?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
    const bundle = await publishStorefront(current.storefront.id);
    await recordEvent({
      entityType: "drop",
      entityId: params.id,
      eventType: "admin_published",
      level: "info",
      message: "Admin published DropLink.",
      metadataJson: { slug: bundle.storefront.slug },
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    return redirectTo(request, `/admin?storefront=${bundle.storefront.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    return redirectTo(request, `/admin?error=${encodeURIComponent(message)}`);
  }
}
