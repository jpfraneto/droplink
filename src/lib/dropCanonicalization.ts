import { createHash } from "crypto";
import { getDomain } from "tldts";
import { withDefaultHttpsScheme } from "./urls";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src"
];

export type CanonicalDropTarget = {
  originalSubmittedUrl: string;
  sourceUrl: string;
  canonicalUrl: string;
  canonicalDomain: string;
  canonicalRootDomain: string;
  registrableDomain: string;
  submittedHost: string;
  submittedPath: string;
  domainHash: string;
  rootDomainHash: string;
};

export function canonicalizeDropUrl(input: string): CanonicalDropTarget {
  const originalSubmittedUrl = input.trim();
  if (!originalSubmittedUrl) throw new Error("submittedUrl is required.");
  let parsed: URL;
  try {
    parsed = new URL(withDefaultHttpsScheme(originalSubmittedUrl));
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("DropLink only accepts http and https URLs.");
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  for (const key of TRACKING_PARAMS) parsed.searchParams.delete(key);
  const sorted = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  parsed.search = "";
  for (const [key, value] of sorted) parsed.searchParams.append(key, value);
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
  const canonicalUrl = parsed.toString();
  const submittedHost = parsed.hostname;
  const submittedPath = `${parsed.pathname}${parsed.search}`;
  const registrableDomain = getDomain(submittedHost, { allowPrivateDomains: true });
  if (!registrableDomain) throw new Error("Could not determine the registrable root domain for this URL.");
  const canonicalRootDomain = registrableDomain.toLowerCase();
  const canonicalDomain = canonicalRootDomain;
  const rootDomainHash = createHash("sha256").update(canonicalRootDomain).digest("hex");
  const domainHash = rootDomainHash;
  return {
    originalSubmittedUrl,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    canonicalDomain,
    canonicalRootDomain,
    registrableDomain: canonicalRootDomain,
    submittedHost,
    submittedPath,
    domainHash,
    rootDomainHash
  };
}
