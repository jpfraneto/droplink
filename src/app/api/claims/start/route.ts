import { NextResponse } from "next/server";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { redirectTo } from "@/lib/redirects";
import { recordEvent, startDnsClaim } from "@/lib/store";

export async function POST(request: Request) {
  if (!rateLimit(`claim-start:${requestIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many claim attempts." }, { status: 429 });
  }
  const contentType = request.headers.get("content-type") || "";
  const raw =
    contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  const storefrontId = String(raw.storefrontId || "");
  if (!storefrontId) return NextResponse.json({ error: "Missing storefrontId." }, { status: 400 });
  const claim = await startDnsClaim(storefrontId, {
    claimantWallet: raw.claimantWallet ? String(raw.claimantWallet) : null,
    claimantEmail: raw.claimantEmail ? String(raw.claimantEmail) : null,
    claimantName: raw.claimantName ? String(raw.claimantName) : null
  });
  await recordEvent({
    entityType: "storefront",
    entityId: storefrontId,
    eventType: "dns_claim_started",
    level: "info",
    message: "DNS claim started.",
    metadataJson: { txtName: claim.txtName },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });
  if (contentType.includes("application/json")) return NextResponse.json({ claim });
  return redirectTo(request, `/claim/${claim.id}`);
}
