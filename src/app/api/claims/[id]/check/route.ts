import { NextResponse } from "next/server";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { redirectTo } from "@/lib/redirects";
import { getClaim, recordEvent, verifyDropClaim } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const wantsJson = request.headers.get("accept")?.includes("application/json") || request.headers.get("content-type")?.includes("application/json");
  if (!rateLimit(`claim-check:${params.id}:${requestIp(request)}`, 6, 60_000)) {
    if (!wantsJson) return redirectTo(request, `/claim/${params.id}?status=rate_limited`);
    return NextResponse.json({ error: "Too many claim checks." }, { status: 429 });
  }
  const claim = await getClaim(params.id);
  if (!claim) {
    if (!wantsJson) return redirectTo(request, `/claim/${params.id}?status=not_found`);
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }
  try {
    const ok = Boolean(claim.dropId ? await verifyDropClaim(claim.dropId) : false);
    if (ok) {
      await recordEvent({
        entityType: "storefront",
        entityId: claim.storefrontId,
        eventType: "dns_claim_verified",
        level: "info",
        message: "DNS claim verified.",
        metadataJson: { txtName: claim.txtName },
        requestId: request.headers.get("x-request-id"),
        traceId: null
      });
    } else {
      await recordEvent({
        entityType: "storefront",
        entityId: claim.storefrontId,
        eventType: "dns_claim_failed",
        level: "warn",
        message: "DNS claim TXT value not found.",
        metadataJson: { txtName: claim.txtName },
        requestId: request.headers.get("x-request-id"),
        traceId: null
      });
    }
    if (!wantsJson) return redirectTo(request, `/claim/${claim.id}?status=${ok ? "verified" : "missing"}`);
    return NextResponse.json({ verified: ok, claimId: claim.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DNS lookup failed.";
    if (!wantsJson) return redirectTo(request, `/claim/${claim.id}?status=error&message=${encodeURIComponent(message)}`);
    return NextResponse.json({ verified: false, error: message }, { status: 400 });
  }
}
