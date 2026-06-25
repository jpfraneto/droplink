import { dropConfig, pricingConfig } from "./env";
import type { DropPriceBook, Relic } from "./types";

function centsFromUsd(input: string | number | null | undefined): number {
  const value = Number(input || 0);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function usd(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function estimatePrintfulCostCents(relic: Relic): number {
  const explicit = relic.fulfillmentSpecJson?.estimatedPrintfulCostUsd;
  if (explicit) return centsFromUsd(explicit);
  const haystack = `${relic.productFamily} ${relic.archetype} ${relic.fulfillmentSpecJson?.productName || ""}`.toLowerCase();
  if (/hoodie/.test(haystack)) return 3400;
  if (/poster|print|canvas/.test(haystack)) return 1400;
  if (/mug/.test(haystack)) return 1200;
  if (/tote|bag/.test(haystack)) return 1600;
  if (/hat|cap/.test(haystack)) return 1800;
  if (/sticker/.test(haystack)) return 600;
  return 2200;
}

function estimateStripeFeeCents(unitPriceCents: number): number {
  return Math.ceil(unitPriceCents * 0.029 + 30);
}

function psychologicalPrice(cents: number): number {
  const dollars = Math.ceil(cents / 100);
  const ending = dollars < 60 ? 8 : 9;
  const rounded = Math.ceil(dollars / 10) * 10 - (10 - ending);
  return rounded * 100;
}

export function buildDropPriceBook(input: {
  dropId: string;
  relics: Relic[];
  generatedAt: string;
  generatedBy: string;
  summonFeeUsd: string;
}): DropPriceBook {
  const minUnitMarginCents = centsFromUsd(pricingConfig.minUnitMarginUsd);
  const minUnitPriceCents = centsFromUsd(pricingConfig.minUnitPriceUsd);
  const maxUnitPriceCents = centsFromUsd(pricingConfig.maxUnitPriceUsd);
  let maxGrossRevenue = 0;
  let totalPrintfulCost = 0;
  let totalPaymentFees = 0;
  let totalRefundReserve = 0;
  let totalNetMargin = 0;
  let totalCreator = 0;
  let totalOwner = 0;
  let totalProtocol = 0;

  const relics = input.relics.map((relic) => {
    const printfulCost = estimatePrintfulCostCents(relic);
    const agentSuggested = Math.max(relic.priceCents || 0, centsFromUsd(relic.fulfillmentSpecJson?.retailPriceUsd));
    let unitPrice = Math.max(agentSuggested, minUnitPriceCents);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const paymentFee = estimateStripeFeeCents(unitPrice);
      const reserve = Math.ceil((unitPrice * pricingConfig.refundReserveBps) / 10000);
      const safety = Math.ceil((unitPrice * pricingConfig.safetyBufferBps) / 10000);
      const minimum = printfulCost + paymentFee + reserve + safety + minUnitMarginCents;
      const next = psychologicalPrice(Math.max(unitPrice, minimum));
      if (next === unitPrice) break;
      unitPrice = next;
    }
    unitPrice = Math.min(Math.max(unitPrice, minUnitPriceCents), maxUnitPriceCents);
    const paymentFee = estimateStripeFeeCents(unitPrice);
    const reserve = Math.ceil((unitPrice * pricingConfig.refundReserveBps) / 10000);
    const grossMargin = unitPrice - printfulCost;
    const netMargin = unitPrice - printfulCost - paymentFee - reserve;
    const creator = Math.max(0, Math.floor((netMargin * dropConfig.creatorBountyBps) / 10000));
    const protocol = Math.max(0, Math.floor((netMargin * dropConfig.protocolFeeBps) / 10000));
    const owner = Math.max(0, netMargin - creator - protocol);
    const editionCount = 8 as const;
    maxGrossRevenue += unitPrice * editionCount;
    totalPrintfulCost += printfulCost * editionCount;
    totalPaymentFees += paymentFee * editionCount;
    totalRefundReserve += reserve * editionCount;
    totalNetMargin += Math.max(0, netMargin) * editionCount;
    totalCreator += creator * editionCount;
    totalOwner += owner * editionCount;
    totalProtocol += protocol * editionCount;
    return {
      relicId: relic.id,
      relicIndex: Number(relic.relicIndex || 0),
      relicName: relic.name,
      editionCount,
      unitPriceUsd: usd(unitPrice),
      estimatedUnitPrintfulCostUsd: usd(printfulCost),
      estimatedUnitPaymentFeeUsd: usd(paymentFee),
      estimatedUnitRefundReserveUsd: usd(reserve),
      estimatedUnitGrossMarginUsd: usd(grossMargin),
      estimatedUnitNetMarginUsd: usd(Math.max(0, netMargin)),
      projectedCreatorBountyPerUnitUsd: usd(creator),
      projectedDomainOwnerProceedsPerUnitUsd: usd(owner),
      projectedProtocolFeePerUnitUsd: usd(protocol),
      pricingReason: `Priced from agent suggestion, estimated Printful cost, payment fee, refund reserve, ${usd(minUnitMarginCents)} minimum margin, and policy bounds.`
    };
  });

  return {
    currency: "USD",
    status: "draft",
    generatedAt: input.generatedAt,
    pricingPolicy: {
      minUnitMarginUsd: pricingConfig.minUnitMarginUsd.toFixed(2),
      safetyBufferBps: pricingConfig.safetyBufferBps,
      refundReserveBps: pricingConfig.refundReserveBps,
      creatorBountyBps: dropConfig.creatorBountyBps,
      protocolFeeBps: dropConfig.protocolFeeBps,
      minUnitPriceUsd: pricingConfig.minUnitPriceUsd.toFixed(2),
      maxUnitPriceUsd: pricingConfig.maxUnitPriceUsd.toFixed(2)
    },
    relics,
    totals: {
      maxSupply: 24,
      maxGrossRevenueUsd: usd(maxGrossRevenue),
      estimatedTotalPrintfulCostUsd: usd(totalPrintfulCost),
      estimatedTotalPaymentFeesUsd: usd(totalPaymentFees),
      estimatedTotalRefundReserveUsd: usd(totalRefundReserve),
      estimatedTotalNetMarginUsd: usd(totalNetMargin),
      projectedCreatorBountyUsd: usd(totalCreator),
      projectedDomainOwnerProceedsUsd: usd(totalOwner),
      projectedProtocolFeeUsd: usd(totalProtocol),
      summonFeeUsd: input.summonFeeUsd
    }
  };
}

export function priceBookRelicPriceCents(priceBook: DropPriceBook | null | undefined, relicId: string): number | null {
  const entry = priceBook?.relics.find((relic) => relic.relicId === relicId);
  return entry ? centsFromUsd(entry.unitPriceUsd) : null;
}

export function priceBookProfitBlockers(priceBook: DropPriceBook | null | undefined): string[] {
  if (!priceBook) return ["priceBookMissing"];
  return priceBook.relics
    .filter((relic) => centsFromUsd(relic.estimatedUnitNetMarginUsd) < centsFromUsd(priceBook.pricingPolicy.minUnitMarginUsd))
    .map((relic) => `priceBelowMinimumMargin:${relic.relicId}`);
}
