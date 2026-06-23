import Stripe from "stripe";
import { loggedExternalCall } from "./logger";
import { attachStripeSession, completeCheckoutSale, releaseCheckout, reserveEditionForRelic } from "./store";
import type { Relic } from "./types";

export function commissionCents(amountCents: number, commissionBps: number): number {
  return Math.round((amountCents * commissionBps) / 10000);
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia"
  });
}

function appUrl(): string {
  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export async function createRelicCheckoutSession(input: {
  relicId: string;
  baseUrl?: string;
  requestId?: string | null;
  traceId?: string | null;
}): Promise<{ url: string; checkoutId: string; editionNumber: number }> {
  const reserved = await reserveEditionForRelic(input);
  const relic = reserved.bundle.relics.find((entry) => entry.id === input.relicId) as Relic | undefined;
  if (!relic) throw new Error("Relic not found after reservation.");
  const stripe = stripeClient();
  const fee = commissionCents(relic.priceCents, reserved.bundle.storefront.commissionBps);
  const baseUrl = (input.baseUrl || appUrl()).replace(/\/$/, "");

  if (!stripe) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCKS !== "true") {
      await releaseCheckout(reserved.checkout.id);
      throw new Error("STRIPE_SECRET_KEY is required for checkout.");
    }
    const mockSessionId = `mock_${reserved.checkout.id}`;
    await attachStripeSession(reserved.checkout.id, mockSessionId);
    await completeCheckoutSale({
      stripeSessionId: mockSessionId,
      stripePaymentIntentId: `mock_pi_${reserved.checkout.id}`,
      customerEmail: "mock-buyer@droplink.local"
    });
    return {
      url: `${baseUrl}/${reserved.bundle.storefront.slug}?success=mock&session_id=${mockSessionId}`,
      checkoutId: reserved.checkout.id,
      editionNumber: reserved.edition.editionNumber
    };
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
                unit_amount: relic.priceCents,
                product_data: {
                  name: relic.name,
                  description: relic.description,
                  images: [reserved.bundle.mockups.find((entry) => entry.relicId === relic.id)?.imageUrl || ""].filter(Boolean)
                }
              }
            }
          ],
          metadata: {
            storefront_id: reserved.bundle.storefront.id,
            collection_id: reserved.checkout.collectionId,
            relic_id: relic.id,
            relic_edition_id: reserved.edition.id,
            checkout_session_id: reserved.checkout.id
          },
          payment_intent_data: reserved.bundle.storefront.stripeConnectedAccountId
            ? {
                application_fee_amount: fee,
                transfer_data: {
                  destination: reserved.bundle.storefront.stripeConnectedAccountId
                }
              }
            : undefined
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
