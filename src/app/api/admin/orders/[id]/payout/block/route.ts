import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { blockOrderPayout, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || "admin_blocked";
  await blockOrderPayout({ orderId: params.id, reason });
  await recordEvent({
    entityType: "order",
    entityId: params.id,
    eventType: "payout_blocked",
    level: "warn",
    message: "Admin blocked payout.",
    metadataJson: { reason },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });
  return NextResponse.json({ blocked: true, orderId: params.id, reason });
}
