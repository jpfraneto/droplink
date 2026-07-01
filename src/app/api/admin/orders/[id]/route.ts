import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { getOrderBundle } from "@/lib/store";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const detail = await getOrderBundle(params.id);
  if (!detail) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const relic = detail.bundle.relics.find((entry) => entry.id === detail.order.relicId) || null;
  const lifecycle =
    detail.order.status === "refunded" || detail.order.status === "disputed"
      ? detail.order.status
      : detail.fulfillmentOrder?.status === "delivered"
        ? "delivered"
        : detail.fulfillmentOrder?.status === "shipped"
          ? "shipped"
          : detail.fulfillmentOrder?.status === "confirmed"
            ? "printful_confirmed"
            : detail.fulfillmentOrder?.status === "draft_created"
              ? "printful_draft_created"
              : detail.order.status;
  return NextResponse.json({
    lifecycle,
    order: detail.order,
    drop: {
      id: detail.bundle.drop?.id || null,
      canonicalDomain: detail.bundle.drop?.canonicalDomain || null,
      canonicalRootDomain: detail.bundle.drop?.canonicalRootDomain || null,
      slug: detail.bundle.storefront.slug,
      stripeConnectAccountId: detail.bundle.drop?.stripeConnectAccountId || null,
      stripeConnectPayoutsEnabled: Boolean(detail.bundle.drop?.stripeConnectPayoutsEnabled),
      checkoutPaused: Boolean(detail.bundle.drop?.checkoutPaused)
    },
    product: relic
      ? {
          id: relic.id,
          name: relic.name,
          description: relic.description,
          priceCents: relic.priceCents,
          currency: relic.currency,
          fulfillmentSpec: relic.fulfillmentSpecJson
        }
      : null,
    fulfillmentOrder: detail.fulfillmentOrder,
    ledgerEntries: detail.ledgerEntries,
    ledgerAccruals: detail.ledgerAccruals,
    stripeTransfers: detail.stripeTransfers,
    events: detail.bundle.events.filter((entry) => entry.entityId === detail.order.id || entry.metadataJson?.orderId === detail.order.id).slice(0, 100)
  });
}
