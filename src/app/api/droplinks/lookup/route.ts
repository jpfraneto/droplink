import { NextResponse } from "next/server";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { scrapePublicPage } from "@/lib/scrape";
import { brandSlugFromUrl } from "@/lib/slugs";
import { getDropBundleByCanonicalHash } from "@/lib/store";

function fallbackTitle(domain: string) {
  return domain
    .replace(/\..*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackFavicon(url: string): string | null {
  try {
    return new URL("/favicon.ico", url).toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const submittedUrl = url.searchParams.get("url") || "";

  try {
    const target = canonicalizeDropUrl(submittedUrl);
    const existing = await getDropBundleByCanonicalHash(target.rootDomainHash);
    let title = fallbackTitle(target.canonicalRootDomain);
    let description = target.canonicalRootDomain;
    let favicon: string | null = fallbackFavicon(target.canonicalUrl);
    let finalUrl = target.canonicalUrl;

    try {
      const scraped = await scrapePublicPage(target.canonicalUrl);
      title = scraped.title || title;
      description = scraped.description || description;
      favicon = scraped.favicon || favicon;
      finalUrl = scraped.finalUrl || finalUrl;
    } catch {
      // Lookup should still route users into the DropLink flow when a public
      // site blocks metadata scraping.
    }

    return NextResponse.json({
      slug: existing?.storefront.slug || brandSlugFromUrl(`https://${target.canonicalRootDomain}`),
      url: target.canonicalUrl,
      finalUrl,
      domain: target.canonicalRootDomain,
      title,
      description,
      favicon,
      existing: Boolean(existing),
      dropStatus: existing?.drop?.status || null,
      claimStatus: existing?.drop?.domainClaimStatus || null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not inspect this URL." },
      { status: 400 }
    );
  }
}
