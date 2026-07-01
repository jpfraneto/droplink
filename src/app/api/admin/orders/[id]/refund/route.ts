import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { stripeClient } from "@/lib/stripe";
import { getOrderBundle, markOrderRefundedOrDisputed, recordEvent } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  try {
    const detail = await getOrderBundle(params.id);
    if (!detail) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (detail.order.status === "refunded") return NextResponse.json({ refunded: true, idempotent: true, orderId: detail.order.id });
    if (!detail.order.stripePaymentIntentId) throw new Error("Order has no Stripe PaymentIntent ID.");
    const refund = await stripe.refunds.create(
      {
        payment_intent: detail.order.stripePaymentIntentId,
        metadata: {
          order_id: detail.order.id,
          drop_id: detail.bundle.drop?.id || "",
          reason: "admin_refund"
        }
      },
      { idempotencyKey: `stripe:refund:${detail.order.id}` }
    );
    const result = await markOrderRefundedOrDisputed({
      orderId: detail.order.id,
      stripePaymentIntentId: detail.order.stripePaymentIntentId,
      status: "refunded",
      reason: "admin_refund",
      stripeRefundId: refund.id
    });
    await recordEvent({
      entityType: "order",
      entityId: detail.order.id,
      eventType: "admin_refund_created",
      level: "warn",
      message: "Admin created Stripe refund and blocked payout.",
      metadataJson: { refundId: refund.id },
      requestId: request.headers.get("x-request-id"),
      traceId: detail.bundle.storefront.generationTraceId || null
    });
    return NextResponse.json({ refunded: Boolean(result), refundId: refund.id, orderId: detail.order.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refund order." }, { status: 400 });
  }
}
