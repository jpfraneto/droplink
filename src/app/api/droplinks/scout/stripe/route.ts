import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserFromRequest } from "@/lib/auth";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { assertFiniteDropConfig, dropConfig } from "@/lib/env";
import { enqueueGeneration } from "@/lib/queues";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { brandSlugFromUrl } from "@/lib/slugs";
import { createScoutingCheckoutSession } from "@/lib/stripe";
import { getActiveScoutCheckoutByRootDomainHash, getDropBundleByCanonicalHash, recordDropSourceSignal, recordEvent, withScoutRootDomainLock } from "@/lib/store";

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
    const user = await currentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Login with X to scout.", authRequired: true }, { status: 401 });
    }
    const target = canonicalizeDropUrl(body.submittedUrl);
    return await withScoutRootDomainLock(target.rootDomainHash, async () => {
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
          signalMetadataJson: { duplicateRootDomain: true, provider: "stripe", canonicalRootDomain: target.canonicalRootDomain }
        });
        return NextResponse.json({
          existing: true,
          slug: existing.storefront.slug,
          url: `/${existing.storefront.slug}`
        });
      }

      const activeScout = await getActiveScoutCheckoutByRootDomainHash(target.rootDomainHash);
      if (activeScout) {
        await recordEvent({
          entityType: "scout_checkout_session",
          entityId: activeScout.id,
          eventType: "duplicate_scout_checkout_blocked",
          level: "warn",
          message: "Duplicate in-flight Stripe scout checkout blocked for the same root domain.",
          metadataJson: {
            canonicalRootDomain: target.canonicalRootDomain,
            stripeSessionId: activeScout.stripeSessionId,
            submittedUrl: target.originalSubmittedUrl
          },
          requestId: request.headers.get("x-request-id"),
          traceId: null
        });
        return NextResponse.json(
          {
            error: "A Stripe scouting checkout is already open for this domain. Complete or let the existing Checkout Session expire before starting another.",
            inFlight: true,
            sessionId: activeScout.stripeSessionId,
            canonicalRootDomain: activeScout.canonicalRootDomain,
            expiresAt: activeScout.expiresAt
          },
          { status: 409 }
        );
      }

      if (Number(dropConfig.summonPriceUsdc) <= 0) {
        const job = await enqueueGeneration({
          url: target.canonicalUrl,
          scoutUserId: user.id,
          summonerWallet: body.summonerWallet || `x:${user.username}`,
          creatorDisplayName: `@${user.username}`,
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
        return NextResponse.json(
          {
            free: true,
            jobId: job.id,
            traceId: job.traceId,
            slug: typeof job.inputJson.slug === "string" ? job.inputJson.slug : brandSlugFromUrl(`https://${target.canonicalRootDomain}`),
            storefrontId: job.storefrontId
          },
          { status: 201 }
        );
      }

      const slug = brandSlugFromUrl(`https://${target.canonicalRootDomain}`);
      const session = await createScoutingCheckoutSession({
        submittedUrl: target.originalSubmittedUrl,
        canonicalUrl: target.canonicalUrl,
        canonicalRootDomain: target.canonicalRootDomain,
        rootDomainHash: target.rootDomainHash,
        slug,
        scoutUserId: user.id,
        scoutUsername: user.username,
        summonerWallet: body.summonerWallet || null,
        creatorDisplayName: `@${user.username}`,
        requestId: request.headers.get("x-request-id")
      });

      return NextResponse.json({
        url: session.url,
        sessionId: session.sessionId,
        slug
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create Stripe scouting checkout." },
      { status: 400 }
    );
  }
}
