import Stripe from "stripe";
import { checkoutConfig, dropConfig } from "./env";
import { loggedExternalCall } from "./logger";
import { priceBookRelicPriceCents } from "./pricing";
import { attachStripeSession, createScoutCheckoutSessionRecord, releaseCheckout, reserveEditionForRelic } from "./store";
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

function stripeAllowedCountries() {
  return checkoutConfig.allowedCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}

function checkoutShippingOptions(currency: string): Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined {
  if (checkoutConfig.shippingMode !== "fixed") return undefined;
  const amount = Math.round(checkoutConfig.fixedShippingAmountCents);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        fixed_amount: { amount, currency },
        display_name: "Standard shipping"
      }
    }
  ];
}

export async function createScoutingCheckoutSession(input: {
  submittedUrl: string;
  canonicalUrl: string;
  canonicalRootDomain: string;
  rootDomainHash: string;
  slug: string;
  scoutUserId?: string | null;
  scoutUsername?: string | null;
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
  const environment = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
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
          canonicalRootDomain: input.canonicalRootDomain,
          rootDomainHash: input.rootDomainHash
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
          rootDomainHash: input.rootDomainHash,
          slug: input.slug,
          scoutUserId: input.scoutUserId || "",
          scoutUsername: input.scoutUsername || "",
          summonerWallet: input.summonerWallet || "",
          creatorDisplayName: input.creatorDisplayName || "",
          environment
        },
        payment_intent_data: {
          metadata: {
            type: "droplink_scout",
            canonicalUrl: input.canonicalUrl,
            canonicalRootDomain: input.canonicalRootDomain,
            rootDomainHash: input.rootDomainHash,
            slug: input.slug,
            scoutUserId: input.scoutUserId || "",
            scoutUsername: input.scoutUsername || "",
            environment
          }
        }
      })
  );
  await createScoutCheckoutSessionRecord({
    stripeSessionId: session.id,
    submittedUrl: input.submittedUrl,
    canonicalUrl: input.canonicalUrl,
    canonicalRootDomain: input.canonicalRootDomain,
    rootDomainHash: input.rootDomainHash,
    slug: input.slug,
    scoutUserId: input.scoutUserId || null,
    scoutUsername: input.scoutUsername || null,
    summonerWallet: input.summonerWallet || null,
    creatorDisplayName: input.creatorDisplayName || null,
    amountTotal: session.amount_total || priceCents,
    currency: session.currency || "usd",
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    metadataJson: { provider: "stripe", type: "droplink_scout", environment }
  });
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
    const rootDomain = reserved.bundle.drop?.canonicalRootDomain || reserved.bundle.drop?.registrableDomain || reserved.bundle.drop?.canonicalDomain || reserved.bundle.brand.hostname;
    const checkoutMetadata = {
      checkout_session_id: reserved.checkout.id,
      drop_id: reserved.bundle.drop?.id || "",
      dropId: reserved.bundle.drop?.id || "",
      storefront_id: reserved.bundle.storefront.id,
      storefrontId: reserved.bundle.storefront.id,
      collection_id: reserved.checkout.collectionId,
      collectionId: reserved.checkout.collectionId,
      relic_id: relic.id,
      relicId: relic.id,
      relic_edition_id: reserved.edition.id,
      editionId: reserved.edition.id,
      editionNumber: String(reserved.edition.editionNumber),
      canonical_domain: reserved.bundle.drop?.canonicalDomain || reserved.bundle.brand.hostname,
      canonicalDomain: reserved.bundle.drop?.canonicalDomain || reserved.bundle.brand.hostname,
      root_domain: rootDomain,
      price_book_id: reserved.bundle.drop?.id || "",
      priceBookId: reserved.bundle.drop?.id || "",
      environment: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
      intended_payout_drop_id: reserved.bundle.drop?.id || "",
      stripe_connect_account_id: reserved.bundle.drop?.stripeConnectAccountId || "",
      shipping_mode: checkoutConfig.shippingMode,
      tax_mode: checkoutConfig.stripeTaxEnabled ? "stripe_tax" : "not_collected"
    };
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
        stripe.checkout.sessions.create(
          {
            mode: "payment",
            client_reference_id: reserved.checkout.id,
            success_url: `${baseUrl}/${reserved.bundle.storefront.slug}?success=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/${reserved.bundle.storefront.slug}?cancelled=1`,
            expires_at: Math.floor(new Date(reserved.checkout.expiresAt).getTime() / 1000),
            shipping_address_collection: { allowed_countries: stripeAllowedCountries() },
            shipping_options: checkoutShippingOptions(relic.currency),
            automatic_tax: { enabled: checkoutConfig.stripeTaxEnabled },
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
            metadata: checkoutMetadata,
            payment_intent_data: {
              transfer_group: `droplink_order_pending_${reserved.checkout.id}`,
              metadata: checkoutMetadata
            }
          },
          {
            idempotencyKey: `stripe:checkout:relic:${reserved.checkout.id}`
          }
        )
    );
    await attachStripeSession(reserved.checkout.id, session.id);
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url, checkoutId: reserved.checkout.id, editionNumber: reserved.edition.editionNumber };
  } catch (error) {
    await releaseCheckout(reserved.checkout.id);
    throw error;
  }
}
