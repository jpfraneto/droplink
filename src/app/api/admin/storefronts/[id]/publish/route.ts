import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { redirectTo } from "@/lib/redirects";
import { publishStorefront, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const bundle = await publishStorefront(params.id);
    await recordEvent({
      entityType: "storefront",
      entityId: params.id,
      eventType: "admin_published",
      level: "info",
      message: "Admin published storefront.",
      metadataJson: { slug: bundle.storefront.slug },
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    return redirectTo(request, `/admin?storefront=${params.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    return redirectTo(request, `/admin?error=${encodeURIComponent(message)}&storefront=${params.id}`);
  }
}
