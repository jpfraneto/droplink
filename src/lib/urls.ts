import { lookup } from "dns/promises";
import net from "net";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }

  return false;
}

export async function normalizePublicUrl(input: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid URL, including https://.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("DropLink only accepts public http and https URLs.");
  }

  parsed.hash = "";
  const hostname = parsed.hostname.toLowerCase();

  if (blockedHostnames.has(hostname) || hostname.endsWith(".local") || !hostname.includes(".")) {
    throw new Error("Local or internal hostnames are not allowed.");
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Private and local network addresses are not allowed.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: false });
  if (addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error("That URL resolves to a private network address.");
  }

  return parsed;
}

export function domainFromUrl(input: string): string {
  return new URL(input).hostname.replace(/^www\./, "");
}
