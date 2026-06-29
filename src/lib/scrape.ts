import * as cheerio from "cheerio";
import { normalizePublicUrl } from "./urls";
import type { BrandDiscoveryLink, VisualEvidence } from "./types";

export type ScrapedPage = {
  url: string;
  finalUrl: string;
  domain: string;
  title: string;
  description: string;
  ogImage?: string;
  favicon?: string;
  headings: string[];
  discoveredLinks: BrandDiscoveryLink[];
  visualEvidence: VisualEvidence[];
  textSample: string;
};

const maxBytes = 2_500_000;

const socialHosts = [
  "x.com",
  "twitter.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "github.com",
  "discord.gg",
  "discord.com",
  "warpcast.com",
  "farcaster.xyz",
  "mirror.xyz",
  "medium.com",
  "substack.com"
];

function cleanText(input: string | undefined | null) {
  return (input || "").replace(/\s+/g, " ").trim();
}

function fallbackPage(inputUrl: URL, finalUrl: string, reason: string): ScrapedPage {
  const final = new URL(finalUrl);
  const domain = final.hostname.replace(/^www\./, "");
  const label = domain
    .replace(/\..*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    url: inputUrl.toString(),
    finalUrl,
    domain,
    title: label || domain,
    description: domain,
    ogImage: undefined,
    favicon: new URL("/favicon.ico", finalUrl).toString(),
    headings: [],
    discoveredLinks: [],
    visualEvidence: [
      {
        url: new URL("/favicon.ico", finalUrl).toString(),
        sourcePage: finalUrl,
        kind: "favicon",
        width: null,
        height: null,
        score: 1,
        reason: "Conventional favicon fallback because the public page could not be read."
      }
    ],
    textSample: `The public homepage for ${domain} could not be read by the crawler: ${reason}. Continue with cautious domain-level interpretation only.`
  };
}

function linkKind(url: string, rel = "", label = ""): BrandDiscoveryLink["kind"] {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const combined = `${rel} ${label} ${url}`.toLowerCase();
  if (rel.includes("me") || rel.includes("author")) return "same_as";
  if (socialHosts.some((entry) => host === entry || host.endsWith(`.${entry}`))) return "social";
  if (/blog|journal|news|updates|press/.test(combined)) return "blog";
  if (/docs|developer|api|guide/.test(combined)) return "docs";
  if (/community|discord|forum|telegram|slack/.test(combined)) return "community";
  if (/github|gitlab|source/.test(combined)) return "source";
  return "other";
}

function visualScore(input: {
  kind: VisualEvidence["kind"];
  url: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}) {
  let score = 20;
  if (input.kind === "og_image") score += 35;
  if (input.kind === "favicon") score -= 25;
  if (/logo|mark|brand/i.test(input.alt || input.url)) score += 8;
  if (/avatar|profile/i.test(input.url)) score += 8;
  if (/banner|cover|hero|og|card/i.test(input.url)) score += 18;
  if (/screenshot|product|app|interface/i.test(`${input.alt || ""} ${input.url}`)) score += 16;
  if (input.width && input.height) {
    const area = input.width * input.height;
    if (area >= 200_000) score += 16;
    if (area < 20_000) score -= 20;
    if (input.width < 96 || input.height < 96) score -= 30;
  }
  if (/favicon|apple-touch-icon|icon-192|icon-512/i.test(input.url)) score -= 18;
  return Math.max(0, Math.min(100, score));
}

function imageKind(url: string, alt = ""): VisualEvidence["kind"] {
  const haystack = `${url} ${alt}`.toLowerCase();
  if (/favicon|apple-touch-icon/.test(haystack)) return "favicon";
  if (/avatar|profile/.test(haystack)) return "social_avatar";
  if (/banner|cover|hero/.test(haystack)) return "social_banner";
  if (/article|blog|post|news|press|card|og/.test(haystack)) return "article_cover";
  if (/screenshot|product|app|interface|dashboard/.test(haystack)) return "product_screenshot";
  if (/logo|mark/.test(haystack)) return "logo";
  return "site_image";
}

export async function scrapePublicPage(inputUrl: string): Promise<ScrapedPage> {
  const url = await normalizePublicUrl(inputUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DropLinkBot/0.1 (+https://droplink.app)",
        accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok && [401, 403, 429].includes(response.status)) {
      return fallbackPage(url, response.url || url.toString(), `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`The page returned ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("DropLink can only read public HTML pages for now.");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Could not read the page.");

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        const allowed = Math.max(0, value.length - (total - maxBytes));
        if (allowed > 0) chunks.push(value.slice(0, allowed));
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }

    const html = Buffer.concat(chunks).toString("utf8");
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();

    const finalUrl = response.url || url.toString();
    const final = new URL(finalUrl);
    const title =
      cleanText($("meta[property='og:title']").attr("content")) ||
      cleanText($("title").first().text()) ||
      final.hostname.replace(/^www\./, "");
    const description =
      cleanText($("meta[name='description']").attr("content")) ||
      cleanText($("meta[property='og:description']").attr("content")) ||
      cleanText($("h1").first().text()) ||
      "";
    const ogImage = $("meta[property='og:image']").attr("content");
    const favicon =
      $("link[rel~='icon']").first().attr("href") ||
      $("link[rel='shortcut icon']").first().attr("href") ||
      $("link[rel='apple-touch-icon']").first().attr("href") ||
      $("link[rel='apple-touch-icon-precomposed']").first().attr("href") ||
      "/favicon.ico";
    const headings = $("h1, h2")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter(Boolean)
      .slice(0, 12);
    const discoveredLinks: BrandDiscoveryLink[] = [];
    const seenLinks = new Set<string>();
    $("a[href], link[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;
      try {
        const absolute = new URL(href, finalUrl).toString();
        if (!/^https?:\/\//i.test(absolute) || seenLinks.has(absolute)) return;
        const rel = cleanText($(element).attr("rel"));
        const label = cleanText($(element).text()) || cleanText($(element).attr("aria-label")) || cleanText($(element).attr("title"));
        const kind = linkKind(absolute, rel, label);
        if (kind === "other" && discoveredLinks.length >= 32) return;
        seenLinks.add(absolute);
        discoveredLinks.push({ url: absolute, label: label.slice(0, 80) || new URL(absolute).hostname, kind });
      } catch {
        // Ignore malformed page links.
      }
    });
    const visualEvidence: VisualEvidence[] = [];
    const addVisual = (input: {
      rawUrl?: string | null;
      kind: VisualEvidence["kind"];
      alt?: string;
      width?: number | null;
      height?: number | null;
      reason: string;
    }) => {
      if (!input.rawUrl) return;
      try {
        const absolute = new URL(input.rawUrl, finalUrl).toString();
        if (!/^https?:\/\//i.test(absolute) || visualEvidence.some((entry) => entry.url === absolute)) return;
        visualEvidence.push({
          url: absolute,
          sourcePage: finalUrl,
          kind: input.kind,
          width: input.width || null,
          height: input.height || null,
          score: visualScore({ kind: input.kind, url: absolute, alt: input.alt, width: input.width, height: input.height }),
          reason: input.reason
        });
      } catch {
        // Ignore malformed image URLs.
      }
    };
    addVisual({ rawUrl: ogImage, kind: "og_image", reason: "Open Graph image declared by the source page." });
    addVisual({ rawUrl: favicon, kind: "favicon", reason: "Favicon declared by the source page." });
    $("img[src]").each((_, element) => {
      const rawUrl = $(element).attr("src");
      const alt = cleanText($(element).attr("alt"));
      const width = Number($(element).attr("width")) || null;
      const height = Number($(element).attr("height")) || null;
      addVisual({
        rawUrl,
        kind: imageKind(rawUrl || "", alt),
        alt,
        width,
        height,
        reason: alt ? `Image discovered in page markup with alt text: ${alt.slice(0, 100)}.` : "Image discovered in page markup."
      });
    });
    visualEvidence.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    const textSample = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);

    return {
      url: url.toString(),
      finalUrl,
      domain: final.hostname.replace(/^www\./, ""),
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 260),
      ogImage: ogImage ? new URL(ogImage, finalUrl).toString() : undefined,
      favicon: favicon ? new URL(favicon, finalUrl).toString() : undefined,
      headings,
      discoveredLinks: discoveredLinks.slice(0, 48),
      visualEvidence: visualEvidence.slice(0, 24),
      textSample
    };
  } finally {
    clearTimeout(timeout);
  }
}
