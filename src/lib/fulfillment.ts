import { confirmPrintfulOrder, createPrintfulDraftOrder, findPrintfulOrderByExternalId, printfulConfirmOrders, type PrintfulOrderReference } from "./printful";
import {
  createFulfillmentOrder,
  getFulfillmentOrderByExternalId,
  getFulfillmentOrderByOrderId,
  getOrderBundle,
  markOrderFulfillmentReviewRequired,
  recordEvent,
  updateFulfillmentOrderStatus,
  updateOrderFulfillmentFields
} from "./store";
import type { FulfillmentOrder, Order, StorefrontBundle } from "./types";

type DraftResultStatus =
  | "existing_internal"
  | "existing_order_field_repaired"
  | "existing_external_repaired"
  | "created"
  | "confirmed"
  | "ambiguous_external_state"
  | "retry_refused_not_eligible"
  | "retry_failed";

type DraftResult = {
  status: DraftResultStatus;
  providerOrderId?: string | null;
  providerExternalId?: string | null;
  message?: string;
};

type CreateFulfillmentInput = Parameters<typeof createFulfillmentOrder>[0];
type FulfillmentTestHooks = {
  createFulfillmentOrder?: (input: CreateFulfillmentInput) => Promise<FulfillmentOrder>;
};

let fulfillmentTestHooks: FulfillmentTestHooks = {};

export function __setFulfillmentTestHooks(hooks: FulfillmentTestHooks = {}) {
  fulfillmentTestHooks = hooks;
}

function productionFulfillmentGuardsEnabled() {
  return process.env.NODE_ENV === "production" || process.env.DROPLINK_PRODUCTION_GUARDS === "true";
}

async function persistFulfillmentOrder(input: CreateFulfillmentInput) {
  return fulfillmentTestHooks.createFulfillmentOrder ? fulfillmentTestHooks.createFulfillmentOrder(input) : createFulfillmentOrder(input);
}

function providerStatusToFulfillmentStatus(status?: string | null): FulfillmentOrder["status"] {
  const value = String(status || "").toLowerCase();
  if (/deliver/.test(value)) return "delivered";
  if (/ship|shipment/.test(value)) return "shipped";
  if (/fail|cancel|hold/.test(value)) return "failed";
  if (/confirm|pending|inprocess|processing/.test(value)) return "confirmed";
  return "draft_created";
}

function orderEligible(order: Order) {
  return order.status === "paid" || order.status === "fulfillment_pending";
}

async function repairFromPrintfulReference(input: {
  order: Order;
  bundle: StorefrontBundle;
  reference: PrintfulOrderReference;
  requestId?: string | null;
  source: "order_field" | "external_lookup" | "external_id_row";
}): Promise<DraftResult> {
  const status = providerStatusToFulfillmentStatus(input.reference.status);
  const fulfillment = await persistFulfillmentOrder({
    orderId: input.order.id,
    provider: "printful",
    providerOrderId: input.reference.providerOrderId,
    providerExternalId: input.reference.providerExternalId || input.order.id,
    status,
    requestJson: null,
    responseJson: { reconciliation: input.reference.responseJson, source: input.source },
    dashboardUrl: null,
    costsJson: input.reference.costsJson || null,
    webhookEventsJson: {},
    trackingUrl: null
  });
  await updateOrderFulfillmentFields({
    orderId: input.order.id,
    printfulOrderId: input.reference.providerOrderId,
    printfulStatus: fulfillment.status,
    printfulCostsJson: input.reference.costsJson || undefined
  });
  await recordEvent({
    entityType: "order",
    entityId: input.order.id,
    eventType: input.source === "external_lookup" ? "printful_order_reconciled_external" : "printful_order_reconciled_internal",
    level: "info",
    message: "Existing Printful order was reconciled into local fulfillment state.",
    metadataJson: {
      source: input.source,
      providerOrderId: input.reference.providerOrderId,
      providerExternalId: input.reference.providerExternalId || input.order.id,
      providerStatus: input.reference.status || null
    },
    requestId: input.requestId || null,
    traceId: input.bundle.storefront.generationTraceId || null
  });
  return {
    status: input.source === "external_lookup" ? "existing_external_repaired" : input.source === "order_field" ? "existing_order_field_repaired" : "existing_internal",
    providerOrderId: input.reference.providerOrderId,
    providerExternalId: input.reference.providerExternalId || input.order.id
  };
}

async function markAmbiguous(input: {
  order: Order;
  bundle: StorefrontBundle;
  providerOrderId?: string | null;
  message: string;
  requestId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<DraftResult> {
  await markOrderFulfillmentReviewRequired({
    orderId: input.order.id,
    printfulStatus: "reconciliation_required",
    printfulOrderId: input.providerOrderId || null,
    reason: input.message
  }).catch(() => null);
  await recordEvent({
    entityType: "order",
    entityId: input.order.id,
    eventType: "printful_reconciliation_required",
    level: "error",
    message: input.message,
    metadataJson: {
      providerOrderId: input.providerOrderId || null,
      ...(input.metadataJson || {})
    },
    requestId: input.requestId || null,
    traceId: input.bundle.storefront.generationTraceId || null
  }).catch((error) => {
    console.error("CRITICAL printful_reconciliation_required could not be persisted", {
      orderId: input.order.id,
      providerOrderId: input.providerOrderId || null,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return {
    status: "ambiguous_external_state",
    providerOrderId: input.providerOrderId || null,
    providerExternalId: input.order.id,
    message: input.message
  };
}

export async function ensurePrintfulDraftForOrder(input: {
  orderId: string;
  requestId?: string | null;
  forceConfirm?: boolean;
  triggeredBy?: string | null;
  force?: boolean;
  forceReason?: string | null;
}): Promise<DraftResult> {
  const detail = await getOrderBundle(input.orderId);
  if (!detail) throw new Error("Order not found.");
  const { order, bundle } = detail;
  if (!orderEligible(order)) {
    const message = `Printful draft can only be created for paid orders. Current status: ${order.status}.`;
    await recordEvent({
      entityType: "order",
      entityId: order.id,
      eventType: "printful_retry_refused_not_eligible",
      level: "warn",
      message,
      metadataJson: { triggeredBy: input.triggeredBy || null },
      requestId: input.requestId || null,
      traceId: bundle.storefront.generationTraceId || null
    });
    return { status: "retry_refused_not_eligible", message };
  }
  const existing = await getFulfillmentOrderByOrderId(order.id);
  if (existing?.providerOrderId) {
    return { status: "existing_internal", providerOrderId: existing.providerOrderId, providerExternalId: existing.providerExternalId || order.id };
  }

  if (order.printfulOrderId) {
    return repairFromPrintfulReference({
      order,
      bundle,
      reference: {
        providerOrderId: order.printfulOrderId,
        providerExternalId: order.id,
        status: order.printfulStatus || "draft_created",
        responseJson: { repairedFromOrderPrintfulOrderId: true },
        costsJson: order.printfulCostsJson || null
      },
      requestId: input.requestId,
      source: "order_field"
    });
  }

  const existingByExternalId = await getFulfillmentOrderByExternalId(order.id);
  if (existingByExternalId?.providerOrderId) {
    return repairFromPrintfulReference({
      order,
      bundle,
      reference: {
        providerOrderId: existingByExternalId.providerOrderId,
        providerExternalId: existingByExternalId.providerExternalId || order.id,
        status: existingByExternalId.status,
        responseJson: { repairedFromProviderExternalId: true },
        costsJson: existingByExternalId.costsJson || null
      },
      requestId: input.requestId,
      source: "external_id_row"
    });
  }

  if (order.printfulStatus === "reconciliation_required" || existing?.status === "reconciliation_required") {
    const external = await findPrintfulOrderByExternalId({
      externalId: order.id,
      requestId: input.requestId,
      traceId: bundle.storefront.generationTraceId || null
    });
    if (external) {
      return repairFromPrintfulReference({ order, bundle, reference: external, requestId: input.requestId, source: "external_lookup" });
    }
    return markAmbiguous({
      order,
      bundle,
      message: "Printful state is already marked ambiguous and no external order was found by external_id; refusing to create a second draft.",
      requestId: input.requestId,
      metadataJson: { triggeredBy: input.triggeredBy || null, force: Boolean(input.force), forceReason: input.forceReason || null }
    });
  }

  let external: PrintfulOrderReference | null = null;
  try {
    external = await findPrintfulOrderByExternalId({
      externalId: order.id,
      requestId: input.requestId,
      traceId: bundle.storefront.generationTraceId || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Printful external lookup failed.";
    await recordEvent({
      entityType: "order",
      entityId: order.id,
      eventType: "printful_external_lookup_failed",
      level: "error",
      message,
      metadataJson: { triggeredBy: input.triggeredBy || null },
      requestId: input.requestId || null,
      traceId: bundle.storefront.generationTraceId || null
    });
    return { status: "retry_failed", message };
  }
  if (external) {
    return repairFromPrintfulReference({ order, bundle, reference: external, requestId: input.requestId, source: "external_lookup" });
  }

  if (input.force && productionFulfillmentGuardsEnabled()) {
    return markAmbiguous({
      order,
      bundle,
      message: "Forced Printful draft retry was refused in production; no external order was found and duplicate safety requires normal reconciliation.",
      requestId: input.requestId,
      metadataJson: { triggeredBy: input.triggeredBy || null, forceReason: input.forceReason || null }
    });
  }

  const relic = bundle.relics.find((entry) => entry.id === order.relicId);
  if (!relic) throw new Error("Order relic not found.");

  let draft: Awaited<ReturnType<typeof createPrintfulDraftOrder>> | null = null;
  try {
    draft = await createPrintfulDraftOrder({
      bundle,
      relic,
      orderId: order.id,
      customerEmail: order.customerEmail,
      shippingJson: order.shippingJson,
      requestId: input.requestId,
      traceId: bundle.storefront.generationTraceId || null
    });
    const fulfillment = await persistFulfillmentOrder({
      orderId: order.id,
      provider: "printful",
      providerOrderId: draft.providerOrderId,
      providerExternalId: draft.providerExternalId,
      status: "draft_created",
      requestJson: draft.requestJson,
      responseJson: { draft: draft.responseJson },
      dashboardUrl: draft.dashboardUrl,
      costsJson: draft.costsJson,
      webhookEventsJson: {},
      trackingUrl: null
    });
    await updateOrderFulfillmentFields({
      orderId: order.id,
      printfulOrderId: draft.providerOrderId,
      printfulStatus: "draft_created",
      printfulDashboardUrl: draft.dashboardUrl,
      printfulCostsJson: draft.costsJson || undefined
    });

    const confirmed =
      draft.providerOrderId && (input.forceConfirm || printfulConfirmOrders())
        ? await confirmPrintfulOrder({
            providerOrderId: draft.providerOrderId,
            force: input.forceConfirm,
            requestId: input.requestId,
            traceId: bundle.storefront.generationTraceId || null
          })
        : { status: "draft_created" as const, responseJson: { skipped: true, reason: "Printful confirmation is disabled." } };
    if (confirmed.status === "confirmed") {
      await updateFulfillmentOrderStatus({
        orderId: order.id,
        status: "confirmed",
        responseJson: { confirmation: confirmed.responseJson }
      });
    }
    await recordEvent({
      entityType: "order",
      entityId: order.id,
      eventType: confirmed.status === "confirmed" ? "printful_order_confirmed" : "printful_order_draft_created",
      level: "info",
      message: confirmed.status === "confirmed" ? "Printful order confirmed by explicit action or gated config." : "Printful draft order created for manual review.",
      metadataJson: {
        providerOrderId: draft.providerOrderId,
        providerExternalId: draft.providerExternalId,
        fulfillmentOrderId: fulfillment.id,
        forceConfirm: Boolean(input.forceConfirm),
        triggeredBy: input.triggeredBy || null
      },
      requestId: input.requestId || null,
      traceId: bundle.storefront.generationTraceId || null
    });
    return { status: confirmed.status === "confirmed" ? "confirmed" : "created", providerOrderId: draft.providerOrderId, providerExternalId: draft.providerExternalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fulfillment failed.";
    if (draft?.providerOrderId) {
      await markAmbiguous({
        order,
        bundle,
        providerOrderId: draft.providerOrderId,
        message: `CRITICAL: Printful draft was created but local persistence failed: ${message}`,
        requestId: input.requestId,
        metadataJson: { providerExternalId: draft.providerExternalId, triggeredBy: input.triggeredBy || null }
      });
    } else {
      await updateOrderFulfillmentFields({ orderId: order.id, printfulStatus: "failed", adminReviewRequired: true });
    }
    await recordEvent({
      entityType: "order",
      entityId: order.id,
      eventType: "fulfillment_failed",
      level: "error",
      message,
      metadataJson: { orderId: order.id, providerOrderId: draft?.providerOrderId || null, triggeredBy: input.triggeredBy || null },
      requestId: input.requestId || null,
      traceId: bundle.storefront.generationTraceId || null
    });
    return { status: draft?.providerOrderId ? "ambiguous_external_state" : "retry_failed", providerOrderId: draft?.providerOrderId || null, message };
  }
}

export async function confirmExistingPrintfulOrder(input: { orderId: string; requestId?: string | null }) {
  const detail = await getOrderBundle(input.orderId);
  if (!detail) throw new Error("Order not found.");
  const fulfillment = detail.fulfillmentOrder || (await getFulfillmentOrderByOrderId(input.orderId));
  if (!fulfillment?.providerOrderId) throw new Error("No Printful draft order exists for this DropLink order.");
  if (detail.order.status === "refunded" || detail.order.status === "disputed") throw new Error("Refunded or disputed orders cannot be confirmed.");
  if (!printfulConfirmOrders()) {
    throw new Error("Printful confirmation is disabled. Set PRINTFUL_CONFIRM_ORDERS=true and PRINTFUL_AUTO_CONFIRM_ORDERS=true to enable confirmation.");
  }
  const confirmed = await confirmPrintfulOrder({
    providerOrderId: fulfillment.providerOrderId,
    force: true,
    requestId: input.requestId,
    traceId: detail.bundle.storefront.generationTraceId || null
  });
  await updateFulfillmentOrderStatus({
    orderId: input.orderId,
    status: confirmed.status,
    responseJson: { adminConfirmation: confirmed.responseJson }
  });
  await recordEvent({
    entityType: "order",
    entityId: input.orderId,
    eventType: "printful_order_confirmed",
    level: "info",
    message: "Admin explicitly confirmed Printful fulfillment.",
    metadataJson: { providerOrderId: fulfillment.providerOrderId },
    requestId: input.requestId || null,
    traceId: detail.bundle.storefront.generationTraceId || null
  });
  return { status: confirmed.status, providerOrderId: fulfillment.providerOrderId };
}
