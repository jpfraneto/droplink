import Stripe from "stripe";
import { newId } from "./hashes";
import { saveOrder } from "./store";
import type { Drop, Order, Product } from "./types";

export function platformFeeCents(amountCents: number, platformFeeBps: number): number {
  return Math.round((amountCents * platformFeeBps) / 10000);
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia"
  });
}

export async function createCheckoutSession(drop: Drop, product: Product): Promise<{ url: string; order: Order }> {
  const now = new Date().toISOString();
  const fee = platformFeeCents(product.priceCents, drop.platformFeeBps);
  const stripe = stripeClient();
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!stripe) {
    const order: Order = {
      id: newId("ord"),
      dropId: drop.id,
      productId: product.id,
      stripeCheckoutSessionId: `mock_${newId("checkout")}`,
      stripePaymentIntentId: null,
      amountSubtotalCents: product.priceCents,
      amountTotalCents: product.priceCents,
      platformFeeCents: fee,
      currency: product.currency,
      status: "paid",
      customerEmail: "mock-buyer@droplink.local",
      fulfillmentStatus: "pending",
      createdAt: now,
      updatedAt: now
    };
    await saveOrder(order);
    return { url: `${appUrl}/d/${drop.slug}?success=mock&order=${order.id}`, order };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${appUrl}/d/${drop.slug}?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/d/${drop.slug}?cancelled=1`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.priceCents,
          product_data: {
            name: product.name,
            description: product.description,
            images: [product.mockupUrl]
          }
        }
      }
    ],
    metadata: {
      dropId: drop.id,
      productId: product.id,
      platformFeeBps: String(drop.platformFeeBps),
      platformFeeCents: String(fee)
    },
    payment_intent_data: drop.stripeConnectedAccountId
      ? {
          application_fee_amount: fee,
          transfer_data: {
            destination: drop.stripeConnectedAccountId
          }
        }
      : undefined
  });

  const order: Order = {
    id: newId("ord"),
    dropId: drop.id,
    productId: product.id,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    amountSubtotalCents: product.priceCents,
    amountTotalCents: product.priceCents,
    platformFeeCents: fee,
    currency: product.currency,
    status: "pending",
    customerEmail: session.customer_details?.email || null,
    fulfillmentStatus: "pending",
    createdAt: now,
    updatedAt: now
  };
  await saveOrder(order);

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url, order };
}
