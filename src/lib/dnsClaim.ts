import { resolveTxt } from "dns/promises";

export function txtRecordMatches(records: string[][], expected: string): boolean {
  return records.some((record) => record.join("").trim() === expected);
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
