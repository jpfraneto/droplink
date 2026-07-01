import { x402Config, x402Readiness, dropConfig } from "./env";

export type VerifiedX402Payment = {
  txHash: string;
  payerAddress: string | null;
  recipientAddress: string;
  network: string;
  asset: string;
  amountUsdc: string;
  raw: Record<string, unknown>;
};

function lower(input: string | null | undefined) {
  return String(input || "").toLowerCase();
}

function amountAtLeast(actual: string, expected: string) {
  return Number(actual) >= Number(expected);
}

export async function verifyX402Payment(request: Request, paymentProof?: string | null): Promise<VerifiedX402Payment> {
  const readiness = x402Readiness();
  if (!readiness.ready) throw new Error(`x402 scouting payment is not configured: missing ${readiness.missing.join(", ")}.`);
  const paymentHeader = paymentProof || request.headers.get("x-payment") || request.headers.get("x402-payment") || request.headers.get("payment");
  if (!paymentHeader) throw new Error("x402 payment proof is required before a new DropLink can be scouted.");
  const response = await fetch(`${x402Config.facilitatorUrl.replace(/\/$/, "")}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payment: paymentHeader,
      network: x402Config.network,
      asset: x402Config.acceptedAsset,
      recipientAddress: x402Config.recipientAddress,
    amountUsdc: dropConfig.summonPriceUsdc
    })
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.valid !== true) {
    throw new Error(`x402 payment verification failed${typeof json.error === "string" ? `: ${json.error}` : "."}`);
  }
  const txHash = String(json.txHash || json.transactionHash || "");
  const recipientAddress = String(json.recipientAddress || json.recipient || "");
  const network = String(json.network || "");
  const asset = String(json.asset || "");
  const amountUsdc = String(json.amountUsdc || json.amount || "");
  if (!txHash) throw new Error("x402 payment verification did not return a transaction hash.");
  if (lower(recipientAddress) !== lower(x402Config.recipientAddress)) throw new Error("x402 payment recipient does not match DropLink treasury.");
  if (lower(network) !== lower(x402Config.network)) throw new Error("x402 payment network is not accepted.");
  if (lower(asset) !== lower(x402Config.acceptedAsset)) throw new Error("x402 payment asset is not accepted.");
  if (!amountAtLeast(amountUsdc, dropConfig.summonPriceUsdc)) throw new Error("x402 payment amount is below the scouting price.");
  return {
    txHash,
    payerAddress: typeof json.payerAddress === "string" ? json.payerAddress : typeof json.from === "string" ? json.from : null,
    recipientAddress,
    network,
    asset,
    amountUsdc,
    raw: json
  };
}
