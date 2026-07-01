import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { recordEvent, setDropCheckoutPaused } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { paused?: boolean; reason?: string };
  const drop = await setDropCheckoutPaused({ dropId: params.id, paused: Boolean(body.paused), reason: body.reason || null });
  if (!drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
  await recordEvent({
    entityType: "drop",
    entityId: params.id,
    eventType: body.paused ? "checkout_paused" : "checkout_resumed",
    level: body.paused ? "warn" : "info",
    message: body.paused ? "Admin paused checkout for this DropLink." : "Admin resumed checkout for this DropLink.",
    metadataJson: { reason: body.reason || null },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });
  return NextResponse.json({ dropId: drop.id, checkoutPaused: Boolean(drop.checkoutPaused), checkoutPauseReason: drop.checkoutPauseReason || null });
}
