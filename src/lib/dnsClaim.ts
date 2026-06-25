import { resolveTxt } from "dns/promises";

export function txtRecordMatches(records: string[][], expected: string): boolean {
  return records.some((record) => record.join("").trim() === expected);
}

export function parseDroplinkClaimValue(value: string): { nonce: string; wallet?: string; contact?: string } | null {
  const parts = Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      })
  );
  const nonce = parts["droplink-claim"];
  if (!nonce) return null;
  return { nonce, wallet: parts.wallet, contact: parts.contact };
}

export function txtRecordClaimMatches(records: string[][], expectedNonce: string, expectedWallet: string): boolean {
  return records.some((record) => {
    const parsed = parseDroplinkClaimValue(record.join("").trim());
    return Boolean(parsed && parsed.wallet && parsed.nonce === expectedNonce && parsed.wallet.toLowerCase() === expectedWallet.toLowerCase());
  });
}

export function txtRecordNonceMatches(records: string[][], expectedNonce: string): boolean {
  return records.some((record) => parseDroplinkClaimValue(record.join("").trim())?.nonce === expectedNonce);
}

export function parseDroplinkPayoutValue(value: string): { dropId: string; nonce: string; wallet: string; chain: string } | null {
  const parts = Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      })
  );
  const dropId = parts["droplink-payout"];
  const nonce = parts.nonce;
  const wallet = parts.wallet;
  const chain = parts.chain;
  if (!dropId || !nonce || !wallet || !chain) return null;
  return { dropId, nonce, wallet, chain };
}

export function txtRecordPayoutMatches(records: string[][], expected: { dropId: string; nonce: string; wallet: string; chain: string }): boolean {
  return records.some((record) => {
    const parsed = parseDroplinkPayoutValue(record.join("").trim());
    return Boolean(
      parsed &&
        parsed.dropId === expected.dropId &&
        parsed.nonce === expected.nonce &&
        parsed.wallet.toLowerCase() === expected.wallet.toLowerCase() &&
        parsed.chain.toLowerCase() === expected.chain.toLowerCase()
    );
  });
}

export async function verifyDnsTxt(txtName: string, expected: string): Promise<boolean> {
  try {
    const records = await resolveTxt(txtName);
    return txtRecordMatches(records, expected);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ETIMEOUT") return false;
    throw error;
  }
}

export async function verifyDroplinkDnsClaim(txtName: string, expectedNonce: string, expectedWallet: string) {
  try {
    const records = await resolveTxt(txtName);
    return { ok: txtRecordClaimMatches(records, expectedNonce, expectedWallet), records };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ETIMEOUT") return { ok: false, records: [] as string[][] };
    throw error;
  }
}

export async function verifyDroplinkDnsNonce(txtName: string, expectedNonce: string) {
  try {
    const records = await resolveTxt(txtName);
    return { ok: txtRecordNonceMatches(records, expectedNonce), records };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ETIMEOUT") return { ok: false, records: [] as string[][] };
    throw error;
  }
}

export async function verifyDroplinkPayoutDns(txtName: string, expected: { dropId: string; nonce: string; wallet: string; chain: string }) {
  try {
    const records = await resolveTxt(txtName);
    return { ok: txtRecordPayoutMatches(records, expected), records };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ETIMEOUT") return { ok: false, records: [] as string[][] };
    throw error;
  }
}
