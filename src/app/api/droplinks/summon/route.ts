import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { currentUserFromRequest } from "@/lib/auth";
import { assertFiniteDropConfig } from "@/lib/env";
import { dropConfig } from "@/lib/env";
import { enqueueGeneration } from "@/lib/queues";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { getDropBundleByCanonicalHash, recordDropSourceSignal, recordEvent } from "@/lib/store";
import { verifyX402Payment, type VerifiedX402Payment } from "@/lib/x402";

const schema = z.object({
  submittedUrl: z.string().min(3),
  x402PaymentProof: z.string().trim().min(3).optional(),
  summonerWallet: z.string().optional(),
  creatorDisplayName: z.string().optional()
});

function zeroDollarScoutPayment(request: Request, body: z.infer<typeof schema>): VerifiedX402Payment {
  const ip = requestIp(request).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "local";
  const payerAddress = body.summonerWallet || request.headers.get("x-scout-wallet") || `test_scout_${ip}`;
  return {
    txHash: `free_scout_${Date.now().toString(36)}`,
    payerAddress,
    recipientAddress: "test-free-summon",
    network: "test",
    asset: "USDC",
    amountUsdc: "0",
    raw: {
      valid: true,
      testMode: true,
      reason: "DROPLINK_SUMMON_PRICE_USDC is 0"
    }
  };
}

export async function POST(request: Request) {
  if (!rateLimit(`summon:${requestIp(request)}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many summon attempts." }, { status: 429 });
  }
  try {
    assertFiniteDropConfig();
    const body = schema.parse(await request.json());
    const user = await currentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Login with X to scout.", authRequired: true }, { status: 401 });
    }
    const target = canonicalizeDropUrl(body.submittedUrl);
    const existing = await getDropBundleByCanonicalHash(target.rootDomainHash);
    if (existing?.drop) {
      await recordDropSourceSignal({
        dropId: existing.drop.id,
        submittedUrl: target.originalSubmittedUrl,
        submittedHost: target.submittedHost,
        submittedPath: target.submittedPath,
        normalizedUrl: target.sourceUrl,
        submittedByWallet: user.username,
        usedForGeneration: false,
        signalMetadataJson: { duplicateRootDomain: true, canonicalRootDomain: target.canonicalRootDomain }
      });
      await recordEvent({
        entityType: "drop",
        entityId: existing.drop.id,
        eventType: "duplicate_scout_detected",
        level: "info",
        message: "Existing DropLink returned without charging again.",
        metadataJson: { canonicalRootDomain: target.canonicalRootDomain, submittedUrl: target.sourceUrl, status: existing.drop.status },
        requestId: request.headers.get("x-request-id"),
        traceId: existing.storefront.generationTraceId || null
      });
      return NextResponse.json({
        existing: true,
        message: `${target.canonicalRootDomain} has already been scouted. Returning the existing DropLink without charging again.`,
        drop: existing.drop,
        storefront: existing.storefront,
        slug: existing.storefront.slug
      });
    }
    const payment = Number(dropConfig.summonPriceUsdc) <= 0
      ? zeroDollarScoutPayment(request, body)
      : await verifyX402Payment(request, body.x402PaymentProof);
    const job = await enqueueGeneration({
      url: target.canonicalUrl,
      scoutUserId: user.id,
      summonerWallet: payment.payerAddress || body.summonerWallet || null,
      creatorDisplayName: `@${user.username}`,
      summonPaymentTxHash: payment.txHash,
      summonPaymentMetadataJson: payment.raw,
      requestId: request.headers.get("x-request-id")
    });
    await recordEvent({
      entityType: "generation_job",
      entityId: job.id,
      eventType: "drop_scouted",
      level: "info",
      message: "Scout payment approved; generation queued.",
      metadataJson: { canonicalUrl: target.canonicalUrl, txHash: payment.txHash },
      requestId: request.headers.get("x-request-id"),
      traceId: job.traceId
    });
    return NextResponse.json({
      existing: false,
      jobId: job.id,
      traceId: job.traceId,
      slug: typeof job.inputJson.slug === "string" ? job.inputJson.slug : undefined,
      storefrontId: job.storefrontId
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not scout DropLink.";
    const status = message.includes("x402") || message.includes("payment") ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
