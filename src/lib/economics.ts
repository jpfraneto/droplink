export type WaterfallInput = {
  grossAmount: number;
  currency: string;
  taxes?: number;
  shippingAmount?: number;
  stripeFeeAmount?: number;
  printfulCostAmount?: number;
  refundReserveAmount?: number;
  creatorBountyBps: number;
  protocolFeeBps: number;
};

export type Waterfall = {
  grossAmount: number;
  currency: string;
  taxAmount: number;
  shippingAmount: number;
  stripeFeeAmount: number;
  printfulCostAmount: number;
  refundReserveAmount: number;
  netMarginAmount: number;
  creatorBountyAmount: number;
  domainOwnerAmount: number;
  protocolFeeAmount: number;
  adminReviewRequired: boolean;
};

export function calculateWaterfall(input: WaterfallInput): Waterfall {
  const taxAmount = input.taxes || 0;
  const shippingAmount = input.shippingAmount || 0;
  const stripeFeeAmount = input.stripeFeeAmount || 0;
  const printfulCostAmount = input.printfulCostAmount || 0;
  const refundReserveAmount = input.refundReserveAmount || 0;
  const netMarginAmount = input.grossAmount - taxAmount - shippingAmount - stripeFeeAmount - printfulCostAmount - refundReserveAmount;
  if (netMarginAmount <= 0) {
    return {
      grossAmount: input.grossAmount,
      currency: input.currency,
      taxAmount,
      shippingAmount,
      stripeFeeAmount,
      printfulCostAmount,
      refundReserveAmount,
      netMarginAmount,
      creatorBountyAmount: 0,
      domainOwnerAmount: 0,
      protocolFeeAmount: 0,
      adminReviewRequired: true
    };
  }
  const creatorBountyAmount = Math.floor((netMarginAmount * input.creatorBountyBps) / 10000);
  const protocolFeeAmount = Math.floor((netMarginAmount * input.protocolFeeBps) / 10000);
  const domainOwnerAmount = Math.max(0, netMarginAmount - creatorBountyAmount - protocolFeeAmount);
  return {
    grossAmount: input.grossAmount,
    currency: input.currency,
    taxAmount,
    shippingAmount,
    stripeFeeAmount,
    printfulCostAmount,
    refundReserveAmount,
    netMarginAmount,
    creatorBountyAmount,
    domainOwnerAmount,
    protocolFeeAmount,
    adminReviewRequired: false
  };
}
