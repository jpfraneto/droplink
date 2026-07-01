import { stripeClient } from "./stripe";
import {
  createStripeTransferRecord,
  getOrderBundle,
  getStripeTransferByIdempotencyKey,
  markStripeTransferCreated,
  markStripeTransferFailed,
  recordEvent
} from "./store";
import type { LedgerAccrual, StripeTransfer } from "./types";

function transferGroup(orderId: string) {
  return `droplink_order_${orderId}`;
}

function eligibleOrderStatus(status: string, adminOverride: boolean) {
  if (status === "refunded" || status === "disputed" || status === "failed") return false;
  if (adminOverride) return status === "paid" || status === "fulfillment_pending" || status === "shipped" || status === "delivered" || status === "fulfilled";
  return status === "shipped" || status === "delivered" || status === "fulfilled";
}

export async function releaseOrderPayout(input: {
  orderId: string;
  beneficiaryType?: LedgerAccrual["beneficiaryType"];
  adminOverride?: boolean;
  requestId?: string | null;
}): Promise<{ created: StripeTransfer[]; skipped: Array<{ accrualId: string; reason: string }> }> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is required to release payouts.");
  const detail = await getOrderBundle(input.orderId);
  if (!detail?.bundle.drop) throw new Error("Order not found.");
  const { order, bundle, fulfillmentOrder } = detail;
  const drop = bundle.drop;
  if (!drop) throw new Error("Order drop not found.");
  const created: StripeTransfer[] = [];
  const skipped: Array<{ accrualId: string; reason: string }> = [];

  if (!eligibleOrderStatus(order.status, Boolean(input.adminOverride))) {
    throw new Error(`Payout blocked by order status: ${order.status}.`);
  }
  if (order.payoutBlockedAt) throw new Error(`Payout manually blocked: ${order.payoutBlockReason || "no reason recorded"}.`);
  if (!fulfillmentOrder?.providerOrderId) throw new Error("Payout blocked until a Printful draft exists.");
  const stripeAccountId = drop.stripeConnectAccountId;
  if (!stripeAccountId) throw new Error("Payout blocked: no Stripe Connect account exists for this drop.");
  if (!drop.stripeConnectPayoutsEnabled && !input.adminOverride) throw new Error("Payout blocked: connected account payouts_enabled is false.");

  const candidates = detail.ledgerAccruals.filter((entry) => entry.status === "pending" && (!input.beneficiaryType || entry.beneficiaryType === input.beneficiaryType));
  for (const accrual of candidates) {
    if (accrual.amount <= 0) {
      skipped.push({ accrualId: accrual.id, reason: "amount <= 0" });
      continue;
    }
    if (accrual.beneficiaryType !== "domain_owner") {
      skipped.push({ accrualId: accrual.id, reason: `${accrual.beneficiaryType} Stripe Connect payout is not implemented; held in ledger` });
      continue;
    }

    const idempotencyKey = `stripe:transfer:${order.id}:${accrual.beneficiaryType}:${accrual.id}`;
    const existing = await getStripeTransferByIdempotencyKey(idempotencyKey);
    if (existing?.stripeTransferId || existing?.status === "created") {
      created.push(existing);
      continue;
    }
    await createStripeTransferRecord({
      orderId: order.id,
      ledgerAccrualId: accrual.id,
      beneficiaryType: accrual.beneficiaryType,
      stripeAccountId,
      amountCents: accrual.amount,
      currency: accrual.currency,
      transferGroup: transferGroup(order.id),
      idempotencyKey,
      metadataJson: {
        order_id: order.id,
        drop_id: drop.id,
        canonical_domain: drop.canonicalRootDomain || drop.canonicalDomain,
        beneficiary_type: accrual.beneficiaryType,
        ledger_accrual_id: accrual.id,
        admin_override: Boolean(input.adminOverride)
      },
      status: "pending"
    });
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: accrual.amount,
          currency: accrual.currency,
          destination: stripeAccountId,
          transfer_group: transferGroup(order.id),
          metadata: {
            order_id: order.id,
            drop_id: drop.id,
            canonical_domain: drop.canonicalRootDomain || drop.canonicalDomain || "",
            beneficiary_type: accrual.beneficiaryType,
            ledger_accrual_id: accrual.id
          }
        },
        { idempotencyKey }
      );
      const stored = await markStripeTransferCreated({
        idempotencyKey,
        stripeTransferId: transfer.id,
        metadataJson: { stripeStatus: "created" }
      });
      if (stored) created.push(stored);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe transfer failed.";
      await markStripeTransferFailed({ idempotencyKey, error: message });
      throw error;
    }
  }

  await recordEvent({
    entityType: "order",
    entityId: order.id,
    eventType: "payout_release_attempted",
    level: "info",
    message: "Admin attempted manual Stripe Connect payout release.",
    metadataJson: { created: created.map((entry) => entry.stripeTransferId), skipped, adminOverride: Boolean(input.adminOverride) },
    requestId: input.requestId || null,
    traceId: bundle.storefront.generationTraceId || null
  });
  return { created, skipped };
}
