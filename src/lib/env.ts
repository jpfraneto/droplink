import { SCOUT_BPS, SCOUTING_PRICE_USDC } from "./protocol";

export type ConfigCheck = {
  ready: boolean;
  missing: string[];
};

function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return raw === "true";
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

export const dropConfig = {
  get summonPriceUsdc() {
    return process.env.DROPLINK_SUMMON_PRICE_USDC || String(SCOUTING_PRICE_USDC);
  },
  get treasuryAddress() {
    return process.env.DROPLINK_TREASURY_ADDRESS || "";
  },
  get creatorBountyBps() {
    return numberEnv("DROPLINK_CREATOR_BOUNTY_BPS", SCOUT_BPS);
  },
  get totalSupply() {
    return numberEnv("DROPLINK_TOTAL_SUPPLY", 24);
  },
  get relicsPerDrop() {
    return numberEnv("DROPLINK_RELICS_PER_DROP", 3);
  },
  get editionsPerRelic() {
    return numberEnv("DROPLINK_EDITIONS_PER_RELIC", 8);
  },
  get protocolFeeBps() {
    return numberEnv("DROPLINK_PROTOCOL_FEE_BPS", 0);
  },
  get requirePayoutBeforePublish() {
    return boolEnv("DROPLINK_REQUIRE_PAYOUT_BEFORE_PUBLISH", false);
  }
};

export const pricingConfig = {
  get minUnitMarginUsd() {
    return numberEnv("DROPLINK_MIN_UNIT_MARGIN_USD", 12);
  },
  get safetyBufferBps() {
    return numberEnv("DROPLINK_PRICE_SAFETY_BUFFER_BPS", 1000);
  },
  get refundReserveBps() {
    return numberEnv("DROPLINK_DEFAULT_REFUND_RESERVE_BPS", 300);
  },
  get minUnitPriceUsd() {
    return numberEnv("DROPLINK_MIN_UNIT_PRICE_USD", 32);
  },
  get maxUnitPriceUsd() {
    return numberEnv("DROPLINK_MAX_UNIT_PRICE_USD", 188);
  }
};

export const checkoutConfig = {
  get globallyPaused() {
    return boolEnv("DROPLINK_CHECKOUT_PAUSED", false);
  },
  get allowedCountries() {
    const raw = process.env.DROPLINK_CHECKOUT_ALLOWED_COUNTRIES || "US";
    return raw
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);
  },
  get shippingMode() {
    const raw = process.env.DROPLINK_SHIPPING_MODE || "included";
    if (raw !== "included" && raw !== "fixed") throw new Error("DROPLINK_SHIPPING_MODE must be included or fixed.");
    return raw;
  },
  get fixedShippingAmountCents() {
    return numberEnv("DROPLINK_FIXED_SHIPPING_AMOUNT_CENTS", 0);
  },
  get stripeTaxEnabled() {
    return boolEnv("DROPLINK_STRIPE_TAX_ENABLED", false);
  }
};

export const x402Config = {
  get enabled() {
    return boolEnv("X402_ENABLED", false);
  },
  get network() {
    return process.env.X402_NETWORK || "tempo";
  },
  get acceptedAsset() {
    return process.env.X402_ACCEPTED_ASSET || "USDC";
  },
  get recipientAddress() {
    return process.env.X402_RECIPIENT_ADDRESS || process.env.DROPLINK_TREASURY_ADDRESS || "0x3D45a97C4f76D43e810Ff107cB6dad3e5AF64641";
  },
  get facilitatorUrl() {
    return process.env.X402_FACILITATOR_URL || "";
  }
};

export const tempoConfig = {
  get enabled() {
    return boolEnv("TEMPO_ENABLED", false);
  },
  get rpcUrl() {
    return process.env.TEMPO_RPC_URL || "";
  },
  get chainId() {
    return process.env.TEMPO_CHAIN_ID || "";
  },
  get usdcAddress() {
    return process.env.TEMPO_USDC_ADDRESS || "";
  },
  get settlementContractAddress() {
    return process.env.TEMPO_SETTLEMENT_CONTRACT_ADDRESS || "";
  },
  get settlementPrivateKey() {
    return process.env.TEMPO_SETTLEMENT_PRIVATE_KEY || "";
  },
  get settlementAbiJson() {
    return process.env.TEMPO_SETTLEMENT_ABI_JSON || "";
  },
  get settlementFunction() {
    return process.env.TEMPO_SETTLEMENT_FUNCTION || "";
  }
};

export function checkEnv(required: string[]): ConfigCheck {
  const missing = required.filter((name) => !process.env[name]);
  return { ready: missing.length === 0, missing };
}

export function x402Readiness(): ConfigCheck {
  if (!x402Config.enabled) return { ready: false, missing: ["X402_ENABLED=true"] };
  return checkEnv(["DROPLINK_SUMMON_PRICE_USDC", "X402_NETWORK", "X402_ACCEPTED_ASSET", "X402_FACILITATOR_URL"]);
}

export function tempoReadiness(): ConfigCheck {
  if (!tempoConfig.enabled) return { ready: false, missing: ["TEMPO_ENABLED=true"] };
  return checkEnv([
    "TEMPO_RPC_URL",
    "TEMPO_CHAIN_ID",
    "TEMPO_USDC_ADDRESS",
    "TEMPO_SETTLEMENT_CONTRACT_ADDRESS",
    "TEMPO_SETTLEMENT_PRIVATE_KEY",
    "TEMPO_SETTLEMENT_ABI_JSON",
    "TEMPO_SETTLEMENT_FUNCTION"
  ]);
}

export function assertFiniteDropConfig() {
  if (dropConfig.totalSupply !== 24 || dropConfig.relicsPerDrop !== 3 || dropConfig.editionsPerRelic !== 8) {
    throw new Error("DropLink finite supply config must be 3 relics x 8 editions = 24 total supply.");
  }
  if (dropConfig.creatorBountyBps < 0 || dropConfig.creatorBountyBps > 10000) throw new Error("DROPLINK_CREATOR_BOUNTY_BPS is invalid.");
  if (dropConfig.protocolFeeBps < 0 || dropConfig.protocolFeeBps > 10000) throw new Error("DROPLINK_PROTOCOL_FEE_BPS is invalid.");
}
