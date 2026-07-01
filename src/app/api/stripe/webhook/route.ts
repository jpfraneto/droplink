import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
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
  markOrderPaymentFailed,
  markOrderRefundedOrDisputed,
  markStripeEventFailed,
  markStripeEventProcessed,
  recordEvent,
  recordDropSourceSignal,
  reconcileOrderStripePayment,
  sendOrderReceiptEmail,
  updateScoutCheckoutSessionRecord,
  updateStripeConnectPayoutStatus,
  verifyCheckoutSessionMatchesReservation
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

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const processing = await beginStripeEventProcessing({ id: event.id, type: event.type, livemode: event.livemode, created: event.created, metadataJson: stripeEventMetadata(event) });
  if (!processing.shouldProcess) return NextResponse.json({ received: true, duplicate: true, status: processing.event?.status || null });

  try {
    const result = await handleStripeEvent(event, request);
    await markStripeEventProcessed(event.id, result || { handled: true });
    return NextResponse.json({ received: true, ...(result || {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await markStripeEventFailed(event.id, message, { type: event.type });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function handleStripeEvent(event: Stripe.Event, request: Request) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return { skipped: "checkout session is not paid" };
    if (session.metadata?.type === "droplink_scout") return handleScoutCheckoutCompleted(session, request);

    await verifyCheckoutSessionMatchesReservation({
      stripeSessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadataCheckoutId: session.metadata?.checkout_session_id || null
    });
    const sale = await completeCheckoutSale({
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripeChargeId: typeof session.payment_intent !== "string" && typeof session.payment_intent?.latest_charge === "string" ? session.payment_intent.latest_charge : null,
      customerEmail: session.customer_details?.email || null,
      shippingJson: session.customer_details ? { customerDetails: session.customer_details, shippingCost: session.shipping_cost || null, automaticTax: session.automatic_tax || null } : null
    });
    await reconcileStripeFeeFromSession(sale.order.id, session);
    await recordEvent({
      entityType: "relic",
      entityId: sale.order.relicId,
      eventType: "edition_sold",
      level: "info",
      message: "Stripe checkout completed; edition marked sold.",
      metadataJson: { orderId: sale.order.id, checkoutSessionId: sale.order.checkoutSessionId, stripeSessionId: session.id },
      requestId: request.headers.get("x-request-id"),
      traceId: sale.bundle.storefront.generationTraceId || null
    });
    try {
      await sendOrderReceiptEmail(sale.order.id);
    } catch (error) {
      await recordEvent({
        entityType: "order",
        entityId: sale.order.id,
        eventType: "order_receipt_email_failed",
        level: "warn",
        message: error instanceof Error ? error.message : "Order receipt email failed.",
        metadataJson: {},
        requestId: request.headers.get("x-request-id"),
        traceId: sale.bundle.storefront.generationTraceId || null
      });
    }
    await ensurePrintfulDraftForOrder({ orderId: sale.order.id, requestId: request.headers.get("x-request-id") }).catch(() => null);
    return { orderId: sale.order.id };
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") {
      await updateScoutCheckoutSessionRecord(session.id, { status: "expired" });
    } else {
      await expireCheckoutByStripeSession(session.id);
    }
    await recordEvent({
      entityType: "checkout_session",
      entityId: String(session.id).slice(0, 64),
      eventType: "checkout_expired",
      level: "info",
      message: "Stripe checkout expired; reservation released when applicable.",
      metadataJson: { type: session.metadata?.type || "buyer_checkout", stripeSessionId: session.id },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    });
    return { expired: true };
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const sessionId = typeof intent.metadata?.checkout_session_id === "string" ? intent.metadata.checkout_session_id : null;
    if (sessionId) await markOrderPaymentFailed({ stripeSessionId: sessionId, reason: intent.last_payment_error?.message || "payment_intent.payment_failed" });
    return { paymentFailed: true, checkoutSessionId: sessionId };
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    return { paymentIntentSucceeded: true, paymentIntentId: intent.id };
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") return handleScoutCheckoutCompleted(session, request);
    return { asyncPaymentSucceeded: true };
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    if (session.metadata?.type === "droplink_scout") {
      await updateScoutCheckoutSessionRecord(session.id, {
        status: "failed",
        error: "checkout.session.async_payment_failed",
        amountTotal: session.amount_total || null,
        currency: session.currency || null
      });
      return { asyncPaymentFailed: true, stripeSessionId: session.id, scoutCheckout: true };
    }
    await expireCheckoutByStripeSession(session.id);
    return { asyncPaymentFailed: true, stripeSessionId: session.id };
  }

  if (event.type === "payment_intent.canceled") {
    const intent = event.data.object;
    return { paymentIntentCanceled: true, paymentIntentId: intent.id };
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    const result = await markOrderRefundedOrDisputed({ stripePaymentIntentId: paymentIntentId, status: "refunded", reason: "charge.refunded" });
    return { refunded: Boolean(result), orderId: result?.order.id || null };
  }

  if (event.type === "refund.created" || event.type === "refund.updated") {
    const refund = event.data.object;
    const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : null;
    if (refund.status === "succeeded" || event.type === "refund.created") {
      const result = await markOrderRefundedOrDisputed({
        stripePaymentIntentId: paymentIntentId,
        status: "refunded",
        reason: event.type,
        stripeRefundId: refund.id
      });
      return { refundRecorded: Boolean(result), orderId: result?.order.id || null };
    }
    return { refundSeen: true, status: refund.status };
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object;
    const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
    const result = await markOrderRefundedOrDisputed({ stripePaymentIntentId: paymentIntentId, status: "disputed", reason: dispute.reason || "charge.dispute.created" });
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
    await recordEvent({
      entityType: "stripe_account",
      entityId: account.id,
      eventType: "stripe_connect_account_updated",
      level: "info",
      message: "Stripe Connect account status updated.",
      metadataJson: {
        payoutsEnabled: Boolean(account.payouts_enabled),
        chargesEnabled: Boolean(account.charges_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
        requirementsCurrentlyDue: account.requirements?.currently_due || [],
        disabledReason: account.requirements?.disabled_reason || null
      },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    });
    return { accountUpdated: true };
  }

  if (["transfer.created", "transfer.failed", "transfer.reversed", "transfer.updated"].includes(String(event.type))) {
    const transfer = event.data.object as any;
    await recordEvent({
      entityType: "stripe_transfer",
      entityId: transfer.id,
      eventType: event.type,
      level: String(event.type) === "transfer.failed" ? "error" : "info",
      message: "Stripe transfer event received.",
      metadataJson: { transferId: transfer.id, amount: transfer.amount, currency: transfer.currency, metadata: transfer.metadata || {} },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    });
    return { transferEvent: true, transferId: transfer.id };
  }

  if (event.type === "payout.failed") {
    const payout = event.data.object;
    await recordEvent({
      entityType: "stripe_payout",
      entityId: payout.id,
      eventType: event.type,
      level: "error",
      message: "Stripe payout failed.",
      metadataJson: { payoutId: payout.id, account: event.account || null },
      requestId: request.headers.get("x-request-id"),
      traceId: null
    });
    return { payoutFailed: true, payoutId: payout.id };
  }

  return { ignored: event.type };
}

function stripeEventMetadata(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as Record<string, any>;
  const metadata = (object?.metadata || {}) as Record<string, unknown>;
  return {
    objectId: typeof object?.id === "string" ? object.id : null,
    objectType: object?.object || null,
    account: event.account || null,
    checkoutSessionId: object?.object === "checkout.session" ? object.id : metadata.checkout_session_id || null,
    paymentIntentId: typeof object?.payment_intent === "string" ? object.payment_intent : object?.payment_intent?.id || null,
    chargeId: object?.object === "charge" ? object.id : typeof object?.latest_charge === "string" ? object.latest_charge : null,
    connectedAccountId: metadata.stripe_connect_account_id || null
  };
}

async function reconcileStripeFeeFromSession(orderId: string, session: Stripe.Checkout.Session) {
  const stripe = stripeClient();
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!stripe || !paymentIntentId) return;
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = typeof intent.latest_charge === "object" && intent.latest_charge ? intent.latest_charge : null;
    const balanceTransaction = typeof charge?.balance_transaction === "object" && charge.balance_transaction ? charge.balance_transaction : null;
    await reconcileOrderStripePayment({
      orderId,
      stripeChargeId: charge?.id || null,
      stripeFeeAmount: typeof balanceTransaction?.fee === "number" ? balanceTransaction.fee : null,
      currency: balanceTransaction?.currency || session.currency || "usd",
      balanceTransactionId: balanceTransaction?.id || null
    });
  } catch (error) {
    await recordEvent({
      entityType: "order",
      entityId: orderId,
      eventType: "stripe_fee_reconcile_failed",
      level: "warn",
      message: error instanceof Error ? error.message : "Stripe fee reconciliation failed.",
      metadataJson: { paymentIntentId },
      requestId: null,
      traceId: null
    });
  }
}

async function handleScoutCheckoutCompleted(session: { [key: string]: any }, request: Request) {
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
      signalMetadataJson: { duplicateRootDomain: true, provider: "stripe", sessionId: session.id }
    });
    await updateScoutCheckoutSessionRecord(session.id, { status: "duplicate", dropId: existing.drop.id, amountTotal: session.amount_total || null, currency: session.currency || null });
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
    return { skipped: "drop already exists" };
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
      currency: session.currency
    },
    requestId: request.headers.get("x-request-id")
  });
  await updateScoutCheckoutSessionRecord(session.id, { status: "completed", generationJobId: job.id, amountTotal: session.amount_total || null, currency: session.currency || null });
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
  return { jobId: job.id };
}
