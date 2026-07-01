import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { ensurePrintfulDraftForOrder } from "@/lib/fulfillment";
import { recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; reason?: string };
  const requestId = request.headers.get("x-request-id");
  const triggeredBy = request.headers.get("x-admin-user") || request.headers.get("x-forwarded-user") || "admin_printful_retry";
  await recordEvent({
    entityType: "order",
    entityId: params.id,
    eventType: "admin_printful_retry_requested",
    level: body.force ? "warn" : "info",
    message: "Admin requested Printful draft reconciliation/retry.",
    metadataJson: {
      triggeredBy,
      force: Boolean(body.force),
      reason: body.reason || null,
      userAgent: request.headers.get("user-agent") || null
    },
    requestId,
    traceId: null
  });
  try {
    const result = await ensurePrintfulDraftForOrder({
      orderId: params.id,
      requestId,
      triggeredBy,
      force: Boolean(body.force),
      forceReason: body.reason || null
    });
    await recordEvent({
      entityType: "order",
      entityId: params.id,
      eventType: "admin_printful_retry_completed",
      level: result.status === "retry_failed" || result.status === "ambiguous_external_state" ? "warn" : "info",
      message: "Admin Printful draft retry completed.",
      metadataJson: result,
      requestId,
      traceId: null
    });
    return NextResponse.json(result);
  } catch (error) {
    await recordEvent({
      entityType: "order",
      entityId: params.id,
      eventType: "admin_printful_retry_failed",
      level: "error",
      message: error instanceof Error ? error.message : "Could not retry Printful draft.",
      metadataJson: { triggeredBy, force: Boolean(body.force), reason: body.reason || null },
      requestId,
      traceId: null
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not retry Printful draft." }, { status: 400 });
  }
}
