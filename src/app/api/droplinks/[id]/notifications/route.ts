import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { createDropNotification, getDropBundleByDropId, recordEvent } from "@/lib/store";

const schema = z.object({
  relicId: z.string().min(3).nullable().optional(),
  email: z.string().email()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!rateLimit(`drop-notify:${params.id}:${requestIp(request)}`, 12, 60_000)) {
    return NextResponse.json({ error: "Too many notification requests." }, { status: 429 });
  }
  try {
    const body = schema.parse(await request.json());
    const bundle = await getDropBundleByDropId(params.id);
    if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
    if (body.relicId && !bundle.relics.some((relic) => relic.id === body.relicId)) {
      return NextResponse.json({ error: "Product not found for this DropLink." }, { status: 404 });
    }
    const notification = await createDropNotification({
      dropId: bundle.drop.id,
      relicId: body.relicId || null,
      email: body.email,
      metadataJson: {
        storefrontId: bundle.storefront.id,
        slug: bundle.storefront.slug,
        domain: bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain
      }
    });
    await recordEvent({
      entityType: "drop",
      entityId: bundle.drop.id,
      eventType: "preview_notification_requested",
      level: "info",
      message: "A visitor asked to be notified when this DropLink goes live.",
      metadataJson: {
        notificationId: notification.id,
        relicId: notification.relicId,
        emailHash: notification.metadataJson?.emailHash
      },
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save notification request." },
      { status: 400 }
    );
  }
}
