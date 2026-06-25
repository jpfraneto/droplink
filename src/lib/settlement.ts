import { tempoConfig, tempoReadiness } from "./env";

export function settlementStatus() {
  return tempoReadiness();
}

export async function writeSettlementReceipt(input: {
  dropId: string;
  orderId: string;
  grossAmount: number;
  netMarginAmount: number;
  creatorBountyAmount: number;
  domainOwnerAmount: number;
  protocolFeeAmount: number;
  currency: string;
}): Promise<string> {
  const readiness = tempoReadiness();
  if (!readiness.ready) {
    throw new Error(`Tempo settlement is not configured: missing ${readiness.missing.join(", ")}.`);
  }
  const [{ createPublicClient, createWalletClient, http }, { privateKeyToAccount }] = await Promise.all([
    import("viem"),
    import("viem/accounts")
  ]);
  const abi = JSON.parse(tempoConfig.settlementAbiJson);
  const account = privateKeyToAccount(tempoConfig.settlementPrivateKey as `0x${string}`);
  const chain = {
    id: Number(tempoConfig.chainId),
    name: "Tempo",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [tempoConfig.rpcUrl] } }
  };
  const walletClient = createWalletClient({ account, chain, transport: http(tempoConfig.rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(tempoConfig.rpcUrl) });
  const hash = await walletClient.writeContract({
    address: tempoConfig.settlementContractAddress as `0x${string}`,
    abi,
    functionName: tempoConfig.settlementFunction,
    args: [
      input.dropId,
      input.orderId,
      BigInt(input.grossAmount),
      BigInt(input.netMarginAmount),
      BigInt(input.creatorBountyAmount),
      BigInt(input.domainOwnerAmount),
      BigInt(input.protocolFeeAmount),
      input.currency
    ]
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
