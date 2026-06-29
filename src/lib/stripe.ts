import Stripe from "stripe";
import { dropConfig } from "./env";
import { loggedExternalCall } from "./logger";
import { priceBookRelicPriceCents } from "./pricing";
import { attachStripeSession, releaseCheckout, reserveEditionForRelic } from "./store";
import type { Relic } from "./types";

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia"
  });
}

export function appUrl(): string {
  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export async function createScoutingCheckoutSession(input: {
  submittedUrl: string;
  canonicalUrl: string;
  canonicalRootDomain: string;
  slug: string;
  summonerWallet?: string | null;
  creatorDisplayName?: string | null;
  baseUrl?: string;
  requestId?: string | null;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is required for Stripe scouting payments.");
  const priceCents = Math.round(Number(dropConfig.summonPriceUsdc) * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error("Stripe scouting checkout requires a positive scouting price.");
  }
  const baseUrl = (input.baseUrl || appUrl()).replace(/\/$/, "");
  const successParams = new URLSearchParams({
    url: input.canonicalUrl,
    domain: input.canonicalRootDomain,
    stripe_scout: "success"
  });
  const cancelParams = new URLSearchParams({
    url: input.canonicalUrl,
    domain: input.canonicalRootDomain,
    stripe_scout: "cancelled"
  });
  const session = await loggedExternalCall(
    {
      provider: "stripe",
      operation: "checkout.sessions.create",
      requestId: input.requestId,
      traceId: null,
      metadata: {
        type: "droplink_scout",
        canonicalRootDomain: input.canonicalRootDomain
      }
    },
    () =>
      stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${baseUrl}/${input.slug}?${successParams.toString()}`,
        cancel_url: `${baseUrl}/${input.slug}?${cancelParams.toString()}`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: priceCents,
              product_data: {
                name: `Scout ${input.canonicalRootDomain} on DropLink`,
                description: "Create a preview DropLink. Products can only be sold after verified owner claim."
              }
            }
          }
        ],
        metadata: {
          type: "droplink_scout",
          submittedUrl: input.submittedUrl,
          canonicalUrl: input.canonicalUrl,
          canonicalRootDomain: input.canonicalRootDomain,
          slug: input.slug,
          summonerWallet: input.summonerWallet || "",
          creatorDisplayName: input.creatorDisplayName || ""
        }
      })
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url, sessionId: session.id };
}

export async function createRelicCheckoutSession(input: {
  relicId: string;
  editionId?: string | null;
  editionNumber?: number | null;
  baseUrl?: string;
  requestId?: string | null;
  traceId?: string | null;
}): Promise<{ url: string; checkoutId: string; editionNumber: number }> {
  const reserved = await reserveEditionForRelic(input);
  const relic = reserved.bundle.relics.find((entry) => entry.id === input.relicId) as Relic | undefined;
  if (!relic) throw new Error("Relic not found after reservation.");
  const lockedPrice = priceBookRelicPriceCents(reserved.bundle.drop?.priceBookJson, relic.id);
  if (!lockedPrice || reserved.bundle.drop?.priceBookJson?.status !== "locked") {
    await releaseCheckout(reserved.checkout.id);
    throw new Error("Locked price book is required for checkout.");
  }
  const stripe = stripeClient();
  const baseUrl = (input.baseUrl || appUrl()).replace(/\/$/, "");

  if (!stripe) {
    await releaseCheckout(reserved.checkout.id);
    throw new Error("STRIPE_SECRET_KEY is required for checkout.");
  }

  try {
    const session = await loggedExternalCall(
      {
        provider: "stripe",
        operation: "checkout.sessions.create",
        requestId: input.requestId,
        traceId: input.traceId,
        metadata: {
          storefrontId: reserved.bundle.storefront.id,
          collectionId: reserved.checkout.collectionId,
          relicId: relic.id,
          relicEditionId: reserved.edition.id
        }
      },
      () =>
        stripe.checkout.sessions.create({
          mode: "payment",
          success_url: `${baseUrl}/${reserved.bundle.storefront.slug}?success=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/${reserved.bundle.storefront.slug}?cancelled=1`,
          expires_at: Math.floor(new Date(reserved.checkout.expiresAt).getTime() / 1000),
          shipping_address_collection: { allowed_countries: ["US"] },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: relic.currency,
                unit_amount: lockedPrice,
                product_data: {
                  name: relic.name,
                  description: relic.description,
                  images: [reserved.bundle.mockups.find((entry) => entry.relicId === relic.id)?.imageUrl || ""].filter(Boolean)
                }
              }
            }
          ],
          metadata: {
            dropId: reserved.bundle.drop?.id || "",
            relicId: relic.id,
            editionId: reserved.edition.id,
            editionNumber: String(reserved.edition.editionNumber),
            priceBookId: reserved.bundle.drop?.id || "",
            canonicalDomain: reserved.bundle.drop?.canonicalDomain || reserved.bundle.brand.hostname,
            summonerWallet: reserved.bundle.drop?.summonerWallet || "",
            payoutWallet: reserved.bundle.drop?.tempoWalletAddress || "",
            storefront_id: reserved.bundle.storefront.id,
            collection_id: reserved.checkout.collectionId,
            relic_id: relic.id,
            relic_edition_id: reserved.edition.id,
            checkout_session_id: reserved.checkout.id
          },
          payment_intent_data: undefined
        })
    );
    await attachStripeSession(reserved.checkout.id, session.id);
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url, checkoutId: reserved.checkout.id, editionNumber: reserved.edition.editionNumber };
  } catch (error) {
    await releaseCheckout(reserved.checkout.id);
    throw error;
  }
}
