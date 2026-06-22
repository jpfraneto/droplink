import { createHash, randomUUID } from "crypto";

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}
