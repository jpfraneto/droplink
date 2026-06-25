import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { requestBaseUrl } from "@/lib/redirects";
import { getDropBundleByDropId, recordEvent } from "@/lib/store";
import { createRelicCheckoutSession } from "@/lib/stripe";

const schema = z.object({
  relicId: z.string().min(3),
  editionId: z.string().optional(),
  editionNumber: z.number().int().min(1).max(8).optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!rateLimit(`droplink-checkout:${requestIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }
  try {
    const body = schema.parse(await request.json());
    const bundle = await getDropBundleByDropId(params.id);
    if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
    if (bundle.drop.status !== "published") return NextResponse.json({ error: "This DropLink is not published for commerce." }, { status: 403 });
    if (!bundle.relics.some((relic) => relic.id === body.relicId)) return NextResponse.json({ error: "Relic does not belong to this DropLink." }, { status: 400 });
    const result = await createRelicCheckoutSession({
      relicId: body.relicId,
      editionId: body.editionId || null,
      editionNumber: body.editionNumber || null,
      baseUrl: requestBaseUrl(request),
      requestId: request.headers.get("x-request-id")
    });
    await recordEvent({
      entityType: "drop",
      entityId: params.id,
      eventType: "checkout_created",
      level: "info",
      message: "Checkout created and one edition reserved.",
      metadataJson: { relicId: body.relicId, checkoutId: result.checkoutId, editionNumber: result.editionNumber },
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    return NextResponse.json({ url: result.url, checkoutId: result.checkoutId, editionNumber: result.editionNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout.";
    return NextResponse.json({ error: message === "SOLD_OUT" ? "SOLD OUT" : message }, { status: message === "SOLD_OUT" ? 409 : 400 });
  }
}
