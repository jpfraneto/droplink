import type { ScrapedPage } from "./scrape";
import type { BrandDiscoveryDossier, BrandDiscoveryLink, VisualEvidence } from "./types";

function words(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["with", "from", "that", "this", "your", "have", "will", "about", "into", "more", "what"].includes(word));
}

function repeatedPhrases(text: string): string[] {
  const tokens = words(text).slice(0, 600);
  const counts = new Map<string, number>();
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => phrase)
    .slice(0, 10);
}

function linkRank(link: BrandDiscoveryLink) {
  const weights: Record<BrandDiscoveryLink["kind"], number> = {
    social: 100,
    same_as: 95,
    source: 80,
    blog: 76,
    docs: 72,
    community: 68,
    other: 20
  };
  return weights[link.kind] || 0;
}

export function bestVisualReferences(dossier: Pick<BrandDiscoveryDossier, "visualEvidence">, limit = 8): VisualEvidence[] {
  return dossier.visualEvidence
    .filter((entry) => entry.score >= 28 && entry.kind !== "favicon")
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, limit);
}

export function buildBrandDiscoveryDossier(input: { page: ScrapedPage; canonicalRootDomain: string }): BrandDiscoveryDossier {
  const discoveredLinks = input.page.discoveredLinks
    .slice()
    .sort((a, b) => linkRank(b) - linkRank(a) || a.url.localeCompare(b.url))
    .slice(0, 32);
  const visualEvidence = input.page.visualEvidence
    .slice()
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, 20);
  return {
    sourceUrl: input.page.url,
    finalUrl: input.page.finalUrl,
    canonicalRootDomain: input.canonicalRootDomain,
    discoveredLinks,
    visualEvidence,
    textSignals: {
      title: input.page.title,
      description: input.page.description,
      headings: input.page.headings,
      repeatedPhrases: repeatedPhrases(`${input.page.title} ${input.page.description} ${input.page.textSample}`),
      textSample: input.page.textSample
    },
    debug: {
      pagesVisited: [input.page.finalUrl],
      blockedUrls: discoveredLinks
        .filter((link) => link.kind === "social" || link.kind === "community")
        .slice(0, 12)
        .map((link) => ({ url: link.url, reason: "Recorded as brand-neighborhood evidence; not fetched in the first dossier pass." }))
    }
  };
}
