import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { createPrintfulDraftOrder, confirmPrintfulOrder } from "@/lib/printful";
import { enqueueGeneration } from "@/lib/queues";
import { stripeClient } from "@/lib/stripe";
import {
  completeCheckoutSale,
  createFulfillmentOrder,
  expireCheckoutByStripeSession,
  getFulfillmentOrderByOrderId,
  getDropBundleByCanonicalHash,
  recordEvent,
  recordDropSourceSignal,
  updateOrderFulfillmentFields,
  updateStripeConnectPayoutStatus
} from "@/lib/store";

export async function POST(request: Request) {
  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
  }

  const raw = await request.text();
  const signature = headers().get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  try {
    const event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status !== "paid") {
        return NextResponse.json({ received: true, skipped: "checkout session is not paid" });
      }
      if (session.metadata?.type === "droplink_scout") {
        const submittedUrl = session.metadata.canonicalUrl || session.metadata.submittedUrl;
        if (!submittedUrl) throw new Error("Stripe scouting session is missing canonicalUrl metadata.");
        const target = canonicalizeDropUrl(submittedUrl);
        const existing = await getDropBundleByCanonicalHash(target.rootDomainHash);
        if (existing?.drop) {
          await recordDropSourceSignal({
            dropId: existing.drop.id,
            submittedUrl: session.metadata.submittedUrl || target.originalSubmittedUrl,
            submittedHost: target.submittedHost,
            submittedPath: target.submittedPath,
            normalizedUrl: target.sourceUrl,
            submittedByWallet: session.metadata.summonerWallet || session.customer_details?.email || null,
            usedForGeneration: false,
            signalMetadataJson: { duplicateRootDomain: true, provider: "stripe", sessionId: session.id }
          });
          await recordEvent({
            entityType: "drop",
            entityId: existing.drop.id,
            eventType: "duplicate_scout_detected",
            level: "info",
            message: "Stripe scouting payment completed after the DropLink already existed.",
            metadataJson: { checkoutSessionId: session.id, canonicalRootDomain: target.canonicalRootDomain },
            requestId: request.headers.get("x-request-id"),
            traceId: existing.storefront.generationTraceId || null
          });
          return NextResponse.json({ received: true, skipped: "drop already exists" });
        }
        const job = await enqueueGeneration({
          url: target.canonicalUrl,
          summonerWallet: session.metadata.summonerWallet || session.customer_details?.email || `stripe:${session.id}`,
          creatorDisplayName: session.metadata.creatorDisplayName || session.customer_details?.email || null,
          summonPaymentTxHash: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
          summonPaymentMetadataJson: {
            provider: "stripe",
            sessionId: session.id,
            paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amountTotal: session.amount_total,
            currency: session.currency
          },
          requestId: request.headers.get("x-request-id")
        });
        await recordEvent({
          entityType: "generation_job",
          entityId: job.id,
          eventType: "drop_scouted",
          level: "info",
          message: "Stripe scouting payment completed; generation queued.",
          metadataJson: { checkoutSessionId: session.id, canonicalUrl: target.canonicalUrl },
          requestId: request.headers.get("x-request-id"),
          traceId: job.traceId
        });
        return NextResponse.json({ received: true, jobId: job.id });
      }
      const sale = await completeCheckoutSale({
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        customerEmail: session.customer_details?.email || null,
        shippingJson: session.customer_details ? { customerDetails: session.customer_details } : null
      });
      await recordEvent({
        entityType: "relic",
        entityId: sale.order.relicId,
        eventType: "edition_sold",
        level: "info",
        message: "Stripe checkout completed; edition marked sold.",
        metadataJson: { orderId: sale.order.id, checkoutSessionId: sale.order.checkoutSessionId },
        requestId: request.headers.get("x-request-id"),
        traceId: sale.bundle.storefront.generationTraceId || null
      });
      const relic = sale.bundle.relics.find((entry) => entry.id === sale.order.relicId);
      if (relic) {
        try {
          const existingFulfillment = await getFulfillmentOrderByOrderId(sale.order.id);
          if (existingFulfillment?.providerOrderId) {
            return NextResponse.json({ received: true, skipped: "printful draft already exists" });
          }
          const draft = await createPrintfulDraftOrder({
            bundle: sale.bundle,
            relic,
            orderId: sale.order.id,
            customerEmail: sale.order.customerEmail,
            shippingJson: sale.order.shippingJson,
            requestId: request.headers.get("x-request-id"),
            traceId: sale.bundle.storefront.generationTraceId || null
          });
          const confirmed = draft.providerOrderId
            ? await confirmPrintfulOrder({
                providerOrderId: draft.providerOrderId,
                requestId: request.headers.get("x-request-id"),
                traceId: sale.bundle.storefront.generationTraceId || null
              })
            : { status: "draft_created" as const, responseJson: draft.responseJson };
          await createFulfillmentOrder({
            orderId: sale.order.id,
            provider: "printful",
            providerOrderId: draft.providerOrderId,
            providerExternalId: draft.providerExternalId,
            status: confirmed.status === "confirmed" ? "confirmed" : "draft_created",
            requestJson: draft.requestJson,
            responseJson: { draft: draft.responseJson, confirmation: confirmed.responseJson },
            dashboardUrl: draft.dashboardUrl,
            costsJson: draft.costsJson,
            webhookEventsJson: {},
            trackingUrl: null
          });
          await updateOrderFulfillmentFields({
            orderId: sale.order.id,
            printfulOrderId: draft.providerOrderId,
            printfulStatus: confirmed.status === "confirmed" ? "confirmed" : "draft_created",
            printfulDashboardUrl: draft.dashboardUrl,
            printfulCostsJson: draft.costsJson || undefined
          });
          await recordEvent({
            entityType: "storefront",
            entityId: sale.bundle.storefront.id,
            eventType: confirmed.status === "confirmed" ? "printful_order_confirmed" : "printful_order_draft_created",
            level: "info",
            message: confirmed.status === "confirmed" ? "Printful order created and confirmed." : "Printful draft order created for manual review.",
            metadataJson: { orderId: sale.order.id, providerOrderId: draft.providerOrderId },
            requestId: request.headers.get("x-request-id"),
            traceId: sale.bundle.storefront.generationTraceId || null
          });
        } catch (error) {
          await recordEvent({
            entityType: "storefront",
            entityId: sale.bundle.storefront.id,
            eventType: "fulfillment_failed",
            level: "error",
            message: error instanceof Error ? error.message : "Fulfillment failed.",
            metadataJson: { orderId: sale.order.id },
            requestId: request.headers.get("x-request-id"),
            traceId: sale.bundle.storefront.generationTraceId || null
          });
        }
      }
    }
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      await expireCheckoutByStripeSession(session.id);
      await recordEvent({
        entityType: "checkout_session",
        entityId: session.id,
        eventType: "checkout_expired",
        level: "info",
        message: "Stripe checkout expired; edition released.",
        metadataJson: {},
        requestId: request.headers.get("x-request-id"),
        traceId: null
      });
    }
    if (event.type === "account.updated") {
      const account = event.data.object;
      await updateStripeConnectPayoutStatus({
        accountId: account.id,
        payoutsEnabled: Boolean(account.payouts_enabled),
        chargesEnabled: Boolean(account.charges_enabled),
        detailsSubmitted: Boolean(account.details_submitted)
      });
      await recordEvent({
        entityType: "stripe_account",
        entityId: account.id,
        eventType: "stripe_connect_account_updated",
        level: "info",
        message: "Stripe Connect account status updated.",
        metadataJson: {
          payoutsEnabled: Boolean(account.payouts_enabled),
          chargesEnabled: Boolean(account.charges_enabled),
          detailsSubmitted: Boolean(account.details_submitted)
        },
        requestId: request.headers.get("x-request-id"),
        traceId: null
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
