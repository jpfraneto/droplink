import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { assertFiniteDropConfig, dropConfig } from "@/lib/env";
import { enqueueGeneration } from "@/lib/queues";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { brandSlugFromUrl } from "@/lib/slugs";
import { createScoutingCheckoutSession } from "@/lib/stripe";
import { getDropBundleByCanonicalHash, recordDropSourceSignal, recordEvent } from "@/lib/store";

const schema = z.object({
  submittedUrl: z.string().min(3),
  summonerWallet: z.string().optional(),
  creatorDisplayName: z.string().optional()
});

export async function POST(request: Request) {
  if (!rateLimit(`stripe-scout:${requestIp(request)}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many scouting checkout attempts." }, { status: 429 });
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
        signalMetadataJson: { duplicateRootDomain: true, provider: "stripe", canonicalRootDomain: target.canonicalRootDomain }
      });
      return NextResponse.json({
        existing: true,
        slug: existing.storefront.slug,
        url: `/${existing.storefront.slug}`
      });
    }

    if (Number(dropConfig.summonPriceUsdc) <= 0) {
      const job = await enqueueGeneration({
        url: target.canonicalUrl,
        summonerWallet: body.summonerWallet || `test_stripe_scout_${requestIp(request).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "local"}`,
        creatorDisplayName: body.creatorDisplayName || null,
        summonPaymentTxHash: `free_stripe_scout_${Date.now().toString(36)}`,
        summonPaymentMetadataJson: {
          provider: "stripe",
          testMode: true,
          reason: "DROPLINK_SUMMON_PRICE_USDC is 0"
        },
        requestId: request.headers.get("x-request-id")
      });
      await recordEvent({
        entityType: "generation_job",
        entityId: job.id,
        eventType: "drop_scouted",
        level: "info",
        message: "Zero-dollar Stripe scout test queued generation.",
        metadataJson: { canonicalUrl: target.canonicalUrl },
        requestId: request.headers.get("x-request-id"),
        traceId: job.traceId
      });
      return NextResponse.json({
        free: true,
        jobId: job.id,
        traceId: job.traceId,
        slug: typeof job.inputJson.slug === "string" ? job.inputJson.slug : brandSlugFromUrl(`https://${target.canonicalRootDomain}`),
        storefrontId: job.storefrontId
      }, { status: 201 });
    }

    const slug = brandSlugFromUrl(`https://${target.canonicalRootDomain}`);
    const session = await createScoutingCheckoutSession({
      submittedUrl: target.originalSubmittedUrl,
      canonicalUrl: target.canonicalUrl,
      canonicalRootDomain: target.canonicalRootDomain,
      slug,
      summonerWallet: body.summonerWallet || null,
      creatorDisplayName: body.creatorDisplayName || null,
      requestId: request.headers.get("x-request-id")
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.sessionId,
      slug
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create Stripe scouting checkout." },
      { status: 400 }
    );
  }
}
