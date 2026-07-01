import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { recordEvent, updateFulfillmentOrderFromProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

function productionWebhookGuardsEnabled() {
  return process.env.NODE_ENV === "production" || process.env.DROPLINK_PRODUCTION_GUARDS === "true";
}

function verifySignature(raw: string, request: Request): { ok: boolean; reason?: string } {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
  if (!secret) {
    if (productionWebhookGuardsEnabled()) return { ok: false, reason: "PRINTFUL_WEBHOOK_SECRET is required in production." };
    return { ok: true, reason: "signature_not_configured_dev" };
  }
  const signature =
    request.headers.get("x-pf-signature") ||
    request.headers.get("x-printful-signature") ||
    request.headers.get("printful-signature");
  if (!signature) return { ok: false, reason: "Missing Printful signature." };
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    const a = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
    const b = Buffer.from(expected, "hex");
    return { ok: a.length === b.length && timingSafeEqual(a, b), reason: "Invalid Printful signature." };
  } catch {
    return { ok: false, reason: "Invalid Printful signature encoding." };
  }
}

function text(input: unknown) {
  return typeof input === "string" || typeof input === "number" ? String(input) : null;
}

function statusFromPrintful(eventType: string, status: string | null) {
  const value = `${eventType} ${status || ""}`.toLowerCase();
  if (/deliver/.test(value)) return "delivered" as const;
  if (/shipment_sent|shipment_shipped|\bship|shipment/.test(value)) return "shipped" as const;
  if (/fail|cancel|hold|returned/.test(value)) return "failed" as const;
  if (/order_confirmed|confirm|inprocess|in_process|processing/.test(value)) return "confirmed" as const;
  if (/order_created|draft/.test(value)) return "draft_created" as const;
  return undefined;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = verifySignature(raw, request);
  if (!signature.ok) {
    await recordEvent({
      entityType: "printful_webhook",
      entityId: "signature",
      eventType: "printful_webhook_rejected",
      level: "error",
      message: signature.reason || "Invalid Printful signature.",
      metadataJson: { production: productionWebhookGuardsEnabled() },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    }).catch(() => null);
    return NextResponse.json({ error: signature.reason || "Invalid Printful signature." }, { status: signature.reason?.includes("required") ? 500 : 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const eventType = text(payload.type) || "printful_webhook";
  const data = (payload.data || {}) as Record<string, unknown>;
  const order = ((data.order || data) as Record<string, unknown>) || {};
  const shipment = ((data.shipment || data) as Record<string, unknown>) || {};
  const providerOrderId = text(order.id) || text(data.order_id);
  const providerExternalId = text(order.external_id) || text(data.external_id);
  const trackingUrl = text(shipment.tracking_url) || text(data.tracking_url);
  const providerStatus = text(order.status) || text(data.status);
  const status = statusFromPrintful(eventType, providerStatus);

  const updated = await updateFulfillmentOrderFromProvider({
    providerOrderId,
    providerExternalId,
    status,
    trackingUrl,
    eventJson: payload
  });

  await recordEvent({
    entityType: updated ? "fulfillment_order" : "printful_webhook",
    entityId: updated?.id || providerExternalId || providerOrderId || "unknown",
    eventType,
    level: updated ? "info" : "warn",
    message: updated ? "Printful webhook persisted." : "Printful webhook received but no fulfillment order matched.",
    metadataJson: {
      providerOrderId,
      providerExternalId,
      providerStatus,
      trackingUrl
    },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });

  return NextResponse.json({ received: true, matched: Boolean(updated) });
}
