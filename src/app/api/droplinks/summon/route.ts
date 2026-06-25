import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { assertFiniteDropConfig } from "@/lib/env";
import { generateDropFromUrl } from "@/lib/generateDrop";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { getDropBundleByCanonicalHash, recordDropSourceSignal, recordEvent } from "@/lib/store";
import { verifyX402Payment } from "@/lib/x402";

const schema = z.object({
  submittedUrl: z.string().min(3),
  summonerWallet: z.string().optional(),
  creatorDisplayName: z.string().optional()
});

export async function POST(request: Request) {
  if (!rateLimit(`summon:${requestIp(request)}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many summon attempts." }, { status: 429 });
  }
  try {
    assertFiniteDropConfig();
    const body = schema.parse(await request.json());
    const target = canonicalizeDropUrl(body.submittedUrl);
    const existing = await getDropBundleByCanonicalHash(target.rootDomainHash);
    if (existing?.drop) {
      await recordDropSourceSignal({
        dropId: existing.drop.id,
        submittedUrl: target.originalSubmittedUrl,
        submittedHost: target.submittedHost,
        submittedPath: target.submittedPath,
        normalizedUrl: target.sourceUrl,
        submittedByWallet: body.summonerWallet || null,
        usedForGeneration: false,
        signalMetadataJson: { duplicateRootDomain: true, canonicalRootDomain: target.canonicalRootDomain }
      });
      await recordEvent({
        entityType: "drop",
        entityId: existing.drop.id,
        eventType: "duplicate_summon_detected",
        level: "info",
        message: "Existing DropLink returned without charging again.",
        metadataJson: { canonicalRootDomain: target.canonicalRootDomain, submittedUrl: target.sourceUrl, status: existing.drop.status },
        requestId: request.headers.get("x-request-id"),
        traceId: existing.storefront.generationTraceId || null
      });
      return NextResponse.json({
        existing: true,
        message: `${target.canonicalRootDomain} has already been summoned. Returning the existing DropLink without charging again.`,
        drop: existing.drop,
        storefront: existing.storefront,
        slug: existing.storefront.slug
      });
    }
    const payment = await verifyX402Payment(request);
    const bundle = await generateDropFromUrl(target.canonicalUrl, {
      summonerWallet: payment.payerAddress || body.summonerWallet || null,
      creatorDisplayName: body.creatorDisplayName || null,
      summonPaymentTxHash: payment.txHash,
      summonPaymentMetadataJson: payment.raw,
      traceId: request.headers.get("x-request-id") || undefined
    });
    await recordEvent({
      entityType: "drop",
      entityId: bundle.drop?.id || bundle.storefront.id,
      eventType: "drop_summoned",
      level: "info",
      message: "Paid x402 summon verified; finite DropLink generated.",
      metadataJson: { canonicalUrl: target.canonicalUrl, txHash: payment.txHash },
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    return NextResponse.json({ existing: false, drop: bundle.drop, storefront: bundle.storefront, slug: bundle.storefront.slug }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not summon DropLink.";
    const status = message.includes("x402") || message.includes("payment") ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
