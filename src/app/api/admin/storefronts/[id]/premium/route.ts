import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { redirectTo } from "@/lib/redirects";
import { markStorefrontPremium, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await markStorefrontPremium(params.id);
  await recordEvent({
    entityType: "storefront",
    entityId: params.id,
    eventType: "admin_marked_premium",
    level: "info",
    message: "Admin marked storefront as Atelier.",
    metadataJson: { tier: "atelier", commissionBps: 0 },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });
  return redirectTo(request, `/admin?storefront=${params.id}`);
}
