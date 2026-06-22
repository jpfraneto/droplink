import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripeClient } from "@/lib/stripe";
import { updateOrderBySession } from "@/lib/store";

export async function POST(request: Request) {
  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ received: true, mode: "mock" });
  }

  const raw = await request.text();
  const signature = headers().get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  try {
    const event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await updateOrderBySession(session.id, {
        status: "paid",
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        customerEmail: session.customer_details?.email || null,
        fulfillmentStatus: "pending"
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
