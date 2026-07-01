import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { ensurePrintfulDraftForOrder } from "@/lib/fulfillment";
import { enqueueGeneration } from "@/lib/queues";
import { stripeClient } from "@/lib/stripe";
import {
  beginStripeEventProcessing,
  completeCheckoutSale,
  expireCheckoutByStripeSession,
  getDropBundleByCanonicalHash,
  getScoutCheckoutSessionByStripeSessionId,
  getStripeEventRecord,
  markOrderRefundedOrDisputed,
  markStripeEventFailed,
  markStripeEventProcessed,
  recordDropSourceSignal,
  recordEvent,
  reconcileOrderStripePayment,
  updateScoutCheckoutSessionRecord,
  updateStripeConnectPayoutStatus,
  verifyCheckoutSessionMatchesReservation
} from "@/lib/store";

function metadata(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as Record<string, any>;
  return {
    objectId: typeof object?.id === "string" ? object.id : null,
    objectType: object?.object || null,
    account: event.account || null,
    paymentIntentId: typeof object?.payment_intent === "string" ? object.payment_intent : object?.payment_intent?.id || null
  };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const record = await getStripeEventRecord(params.id);
  if (!record) return NextResponse.json({ error: "Stripe event record not found." }, { status: 404 });
  return NextResponse.json({ event: record });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  const record = await getStripeEventRecord(params.id);
  if (record?.status === "processed") return NextResponse.json({ skipped: "already_processed", event: record });
  try {
    const event = await stripe.events.retrieve(params.id);
    const processing = await beginStripeEventProcessing({ id: event.id, type: event.type, livemode: event.livemode, created: event.created, metadataJson: metadata(event) });
    if (!processing.shouldProcess) return NextResponse.json({ skipped: "not_retryable", event: processing.event });
    const result = await reprocess(event, request);
    await markStripeEventProcessed(event.id, { reprocessed: true, ...(result || {}) });
    return NextResponse.json({ reprocessed: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe event reprocess failed.";
    await markStripeEventFailed(params.id, message, { reprocessed: true });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function reprocess(event: Stripe.Event, request: Request) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return { skipped: "checkout session is not paid" };
    if (session.metadata?.type === "droplink_scout") return reprocessScoutCheckout(session, request);
    await verifyCheckoutSessionMatchesReservation({
      stripeSessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadataCheckoutId: session.metadata?.checkout_session_id || null
    });
    const sale = await completeCheckoutSale({
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      customerEmail: session.customer_details?.email || null,
      shippingJson: session.customer_details ? { customerDetails: session.customer_details, shippingCost: session.shipping_cost || null } : null
    });
    await reconcileOrderStripePayment({ orderId: sale.order.id, currency: session.currency || "usd" });
    await ensurePrintfulDraftForOrder({ orderId: sale.order.id, requestId: request.headers.get("x-request-id") }).catch(() => null);
    return { orderId: sale.order.id };
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") {
      await updateScoutCheckoutSessionRecord(session.id, { status: "expired" });
      return { expired: true, scoutCheckout: true };
    }
    await expireCheckoutByStripeSession(session.id);
    return { expired: true };
  }
  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") return reprocessScoutCheckout(session, request);
    return { asyncPaymentSucceeded: true };
  }
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") {
      await updateScoutCheckoutSessionRecord(session.id, {
        status: "failed",
        error: "admin_reprocess:checkout.session.async_payment_failed",
        amountTotal: session.amount_total || null,
        currency: session.currency || null
      });
      return { asyncPaymentFailed: true, scoutCheckout: true };
    }
    return { asyncPaymentFailed: true };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    const result = await markOrderRefundedOrDisputed({ stripePaymentIntentId: paymentIntentId, status: "refunded", reason: "admin_reprocess:charge.refunded" });
    return { refunded: Boolean(result), orderId: result?.order.id || null };
  }
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object;
    const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
    const result = await markOrderRefundedOrDisputed({ stripePaymentIntentId: paymentIntentId, status: "disputed", reason: dispute.reason || "admin_reprocess:charge.dispute.created" });
    return { disputed: Boolean(result), orderId: result?.order.id || null };
  }
  if (event.type === "account.updated") {
    const account = event.data.object;
    await updateStripeConnectPayoutStatus({
      accountId: account.id,
      payoutsEnabled: Boolean(account.payouts_enabled),
      chargesEnabled: Boolean(account.charges_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      requirementsCurrentlyDue: account.requirements?.currently_due || [],
      requirementsEventuallyDue: account.requirements?.eventually_due || [],
      disabledReason: account.requirements?.disabled_reason || null
    });
    return { accountUpdated: true };
  }
  await recordEvent({
    entityType: "stripe_event",
    entityId: event.id,
    eventType: "stripe_event_reprocess_ignored",
    level: "info",
    message: "Admin reprocess route intentionally ignored this Stripe event type.",
    metadataJson: { type: event.type },
    requestId: request.headers.get("x-request-id"),
    traceId: null
  });
  return { ignored: event.type };
}

async function reprocessScoutCheckout(session: Stripe.Checkout.Session, request: Request) {
  const priorScout = await getScoutCheckoutSessionByStripeSessionId(session.id);
  if (priorScout?.status === "completed" && priorScout.generationJobId) {
    return { jobId: priorScout.generationJobId, scoutCheckout: true, idempotent: true };
  }
  if (priorScout?.status === "duplicate" && priorScout.dropId) {
    return { skipped: "drop already exists", scoutCheckout: true, dropId: priorScout.dropId, idempotent: true };
  }
  const submittedUrl = session.metadata?.canonicalUrl || session.metadata?.submittedUrl;
  if (!submittedUrl) throw new Error("Stripe scouting session is missing canonicalUrl metadata.");
  const target = canonicalizeDropUrl(submittedUrl);
  const existing = await getDropBundleByCanonicalHash(target.rootDomainHash);
  if (existing?.drop) {
    await recordDropSourceSignal({
      dropId: existing.drop.id,
      submittedUrl: session.metadata?.submittedUrl || target.originalSubmittedUrl,
      submittedHost: target.submittedHost,
      submittedPath: target.submittedPath,
      normalizedUrl: target.sourceUrl,
      submittedByWallet: session.metadata?.scoutUsername || session.metadata?.summonerWallet || session.customer_details?.email || null,
      usedForGeneration: false,
      signalMetadataJson: { duplicateRootDomain: true, provider: "stripe", sessionId: session.id, reprocessed: true }
    });
    await updateScoutCheckoutSessionRecord(session.id, { status: "duplicate", dropId: existing.drop.id, amountTotal: session.amount_total || null, currency: session.currency || null });
    return { skipped: "drop already exists", scoutCheckout: true, dropId: existing.drop.id };
  }
  const job = await enqueueGeneration({
    url: target.canonicalUrl,
    scoutUserId: session.metadata?.scoutUserId || null,
    summonerWallet: session.metadata?.summonerWallet || session.customer_details?.email || `stripe:${session.id}`,
    creatorDisplayName: session.metadata?.creatorDisplayName || session.customer_details?.email || null,
    summonPaymentTxHash: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
    summonPaymentMetadataJson: {
      provider: "stripe",
      sessionId: session.id,
      paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amountTotal: session.amount_total,
      currency: session.currency,
      reprocessed: true
    },
    requestId: request.headers.get("x-request-id")
  });
  await updateScoutCheckoutSessionRecord(session.id, { status: "completed", generationJobId: job.id, amountTotal: session.amount_total || null, currency: session.currency || null });
  await recordEvent({
    entityType: "generation_job",
    entityId: job.id,
    eventType: "drop_scouted",
    level: "info",
    message: "Stripe scouting payment reprocessed; generation queued.",
    metadataJson: { checkoutSessionId: session.id, canonicalUrl: target.canonicalUrl },
    requestId: request.headers.get("x-request-id"),
    traceId: job.traceId
  });
  return { jobId: job.id, scoutCheckout: true };
}
