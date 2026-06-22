import * as cheerio from "cheerio";
import { normalizePublicUrl } from "./urls";

export type ScrapedPage = {
  url: string;
  finalUrl: string;
  domain: string;
  title: string;
  description: string;
  ogImage?: string;
  favicon?: string;
  textSample: string;
};

const maxBytes = 900_000;

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
      if (total > maxBytes) throw new Error("That page is too large for the demo reader.");
      chunks.push(value);
    }

    const html = Buffer.concat(chunks).toString("utf8");
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();

    const finalUrl = response.url || url.toString();
    const final = new URL(finalUrl);
    const title =
      $("meta[property='og:title']").attr("content") ||
      $("title").first().text() ||
      final.hostname.replace(/^www\./, "");
    const description =
      $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      $("h1").first().text() ||
      "";
    const ogImage = $("meta[property='og:image']").attr("content");
    const favicon = $("link[rel='icon']").attr("href") || $("link[rel='shortcut icon']").attr("href");
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
      textSample
    };
  } finally {
    clearTimeout(timeout);
  }
}
