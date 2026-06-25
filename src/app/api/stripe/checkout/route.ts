import { NextResponse } from "next/server";
import { z } from "zod";
import { createRelicCheckoutSession } from "@/lib/stripe";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { requestBaseUrl } from "@/lib/redirects";
import { recordEvent } from "@/lib/store";

const requestSchema = z.object({
  relicId: z.string().min(3),
  editionId: z.string().optional(),
  editionNumber: z.number().int().min(1).max(8).optional()
});

export async function POST(request: Request) {
  if (!rateLimit(`checkout:${requestIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });
  }
  try {
    const body = requestSchema.parse(await request.json());
    const result = await createRelicCheckoutSession({
      relicId: body.relicId,
      editionId: body.editionId || null,
      editionNumber: body.editionNumber || null,
      baseUrl: requestBaseUrl(request),
      requestId: request.headers.get("x-request-id")
    });
    await recordEvent({
      entityType: "relic",
      entityId: body.relicId,
      eventType: "checkout_created",
      level: "info",
      message: "Checkout created and one edition reserved.",
      metadataJson: { checkoutId: result.checkoutId, editionNumber: result.editionNumber },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    });
    return NextResponse.json({ url: result.url, checkoutId: result.checkoutId, editionNumber: result.editionNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout.";
    const status = message === "SOLD_OUT" ? 409 : 400;
    return NextResponse.json({ error: message === "SOLD_OUT" ? "SOLD OUT" : message }, { status });
  }
}
