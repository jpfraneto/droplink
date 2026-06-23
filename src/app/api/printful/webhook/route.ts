import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { recordEvent, updateFulfillmentOrderFromProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

function verifyOptionalSignature(raw: string, request: Request) {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature =
    request.headers.get("x-pf-signature") ||
    request.headers.get("x-printful-signature") ||
    request.headers.get("printful-signature");
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function text(input: unknown) {
  return typeof input === "string" || typeof input === "number" ? String(input) : null;
}

function statusFromPrintful(eventType: string, status: string | null) {
  const value = `${eventType} ${status || ""}`.toLowerCase();
  if (/ship|shipment/.test(value)) return "shipped" as const;
  if (/deliver/.test(value)) return "delivered" as const;
  if (/fail|cancel|hold/.test(value)) return "failed" as const;
  if (/confirm|pending|inprocess|created|update/.test(value)) return "confirmed" as const;
  return undefined;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyOptionalSignature(raw, request)) {
    return NextResponse.json({ error: "Invalid Printful signature." }, { status: 401 });
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
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
