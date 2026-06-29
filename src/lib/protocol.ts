import type { Drop } from "./types";

export type DropLinkStatus = "empty" | "scouted" | "claimed" | "live" | "sold_out";

export const SCOUTING_PRICE_USDC = 8;
export const SCOUT_BPS = 800;
export const OWNER_BPS_WITH_SCOUT = 9200;
export const OWNER_BPS_SELF_CLAIMED = 10000;

function sameIdentity(a?: string | null, b?: string | null) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  return Boolean(left && right && left === right);
}

export function isSelfClaimedDrop(drop: Pick<Drop, "summonerWallet" | "domainOwnerWallet">) {
  return sameIdentity(drop.summonerWallet, drop.domainOwnerWallet);
}

export function revenueSplitForDrop(
  drop: Pick<Drop, "summonerWallet" | "domainOwnerWallet" | "status" | "domainClaimStatus">
) {
  const live = drop.status === "published" || drop.status === "sold_out";
  const claimed = drop.domainClaimStatus === "verified";
  if (!live || !claimed) {
    return {
      ownerBps: 0,
      scoutBps: 0,
      scoutActive: false,
      ownerReceivesAll: false
    };
  }
  if (!drop.summonerWallet || isSelfClaimedDrop(drop)) {
    return {
      ownerBps: OWNER_BPS_SELF_CLAIMED,
      scoutBps: 0,
      scoutActive: false,
      ownerReceivesAll: true
    };
  }
  return {
    ownerBps: OWNER_BPS_WITH_SCOUT,
    scoutBps: SCOUT_BPS,
    scoutActive: true,
    ownerReceivesAll: false
  };
}

export function publicDropLinkStatus(drop: Pick<Drop, "status" | "domainClaimStatus"> | null | undefined): DropLinkStatus {
  if (!drop) return "empty";
  if (drop.status === "sold_out") return "sold_out";
  if (drop.status === "published") return "live";
  if (drop.domainClaimStatus === "verified" || drop.status === "claimed") return "claimed";
  return "scouted";
}

export function displayScout(input?: string | null) {
  const value = String(input || "").trim();
  if (!value) return "anonymous scout";
  if (value.startsWith("@")) return value;
  if (value.length > 18) return `${value.slice(0, 8)}...${value.slice(-6)}`;
  return value;
}
