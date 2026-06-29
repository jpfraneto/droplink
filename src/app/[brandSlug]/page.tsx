import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DroplinkExperience, type DroplinkState, type DroplinkViewModel } from "@/components/DroplinkExperience";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { formatMoney } from "@/lib/productCatalog";
import { displayScout, OWNER_BPS_WITH_SCOUT, publicDropLinkStatus, revenueSplitForDrop, SCOUT_BPS } from "@/lib/protocol";
import { publicProductCopy } from "@/lib/publicCopy";
import { getGenerationJobByTraceId, getStorefrontBundleBySlug } from "@/lib/store";
import type { StorefrontBundle } from "@/lib/types";

export const dynamic = "force-dynamic";

function brandDescription(bundle: StorefrontBundle): string {
  const study = bundle.brandStudy?.studyJson;
  const description = bundle.activeCollection?.subtitle || study?.essence || study?.what_they_bring_to_the_world || study?.worldview || bundle.brand.hostname;
  return oneLine(publicProductCopy(description));
}

function brandTitle(bundle: StorefrontBundle): string {
  return oneLine(publicProductCopy(bundle.activeCollection?.title || bundle.brandStudy?.studyJson.drop_narrative_seed || bundle.brand.name));
}

function oneLine(input: string, max = 150) {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  return (clipped.includes(" ") ? clipped.slice(0, clipped.lastIndexOf(" ")) : clipped).replace(/[,.:-]$/, "");
}

function brandLogoUrl(bundle: StorefrontBundle): string | null {
  const metadata = bundle.assets.find((asset) => asset.metadataJson?.sourceFavicon || asset.metadataJson?.sourceOgImage)?.metadataJson;
  const favicon = metadata?.sourceFavicon;
  const og = metadata?.sourceOgImage;
  return typeof favicon === "string" && favicon ? favicon : typeof og === "string" && og ? og : null;
}

function productImage(bundle: StorefrontBundle, relicId: string): string {
  return (
    bundle.mockups.find((entry) => entry.relicId === relicId)?.imageUrl ||
    bundle.assets.find((entry) => entry.relicId === relicId && entry.type === "preview")?.url ||
    bundle.assets.find((entry) => entry.relicId === relicId && entry.type === "print_file")?.url ||
    ""
  );
}

type ProductRow = {
  id: string;
  relicId: string | null;
  kindLabel: "Wear" | "Display" | "Use";
  title: string;
  description: string;
  imageUrl: string;
  price: string;
  remaining: number;
  total: number;
};

function productRows(bundle: StorefrontBundle): ProductRow[] {
  const labels = ["Wear", "Display", "Use"] as const;
  const relicRows: ProductRow[] = bundle.relics.slice(0, 3).map((relic, index) => {
    const sold = bundle.editions.filter((edition) => edition.relicId === relic.id && edition.status === "sold").length;
    const total = relic.totalSupply || 8;
    return {
      id: relic.id,
      relicId: relic.id,
      kindLabel: labels[index] || "Wear",
      title: oneLine(publicProductCopy(relic.name), 64),
      description: publicProductCopy(relic.description).replace(/\s+/g, " ").trim(),
      imageUrl: productImage(bundle, relic.id),
      price: formatMoney(relic.priceCents, "usd"),
      remaining: Math.max(0, total - sold),
      total
    };
  });
  const fallbackNames = ["Crewneck Sweatshirt", "Framed Poster", "Ceramic Mug"];
  while (relicRows.length < 3) {
    const index = relicRows.length;
    relicRows.push({
      id: `pending-${index}`,
      relicId: null,
      kindLabel: labels[index] || "Wear",
      title: fallbackNames[index],
      description: oneLine(`A quiet object shaped by ${bundle.brand.name}.`, 120),
      imageUrl: "",
      price: formatMoney(0, "usd"),
      remaining: 0,
      total: 8
    });
  }
  return relicRows.slice(0, 3);
}

function percentFromBps(bps: number): string {
  return `${bps / 100}%`;
}

function potentialEarnings(bundle: StorefrontBundle): DroplinkViewModel["potentialEarnings"] {
  const maxGrossRevenueCents = bundle.relics.reduce((sum, relic) => sum + relic.priceCents * (relic.totalSupply || 8), 0);
  if (maxGrossRevenueCents <= 0) return null;
  return {
    claimer: formatMoney(Math.round((maxGrossRevenueCents * SCOUT_BPS) / 10000), "usd"),
    domainOwner: formatMoney(Math.round((maxGrossRevenueCents * OWNER_BPS_WITH_SCOUT) / 10000), "usd"),
    claimerPercent: percentFromBps(SCOUT_BPS),
    domainOwnerPercent: percentFromBps(OWNER_BPS_WITH_SCOUT)
  };
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function faviconForUrl(value: string): string | null {
  try {
    return new URL("/favicon.ico", value).toString();
  } catch {
    return null;
  }
}

function stateForBundle(bundle: StorefrontBundle): DroplinkState {
  if (!bundle.activeCollection || bundle.relics.length < 3) return "processing";
  return publicDropLinkStatus(bundle.drop) as DroplinkState;
}

async function viewModelForBundle(bundle: StorefrontBundle): Promise<DroplinkViewModel> {
  const domain = bundle.drop?.canonicalRootDomain || bundle.brand.hostname;
  const logoUrl = brandLogoUrl(bundle);
  const traceId = bundle.storefront.generationTraceId || null;
  const job = traceId ? await getGenerationJobByTraceId(traceId) : null;
  const split = bundle.drop
    ? revenueSplitForDrop(bundle.drop)
    : { ownerReceivesAll: false, scoutBps: 0, ownerBps: 0, scoutActive: false };
  return {
    slug: bundle.storefront.slug,
    submittedUrl: bundle.drop?.canonicalUrl || bundle.brand.canonicalUrl,
    domain,
    favicon: logoUrl,
    title: brandTitle(bundle),
    description: brandDescription(bundle),
    state: stateForBundle(bundle),
    dropId: bundle.drop?.id || null,
    jobId: job?.id || null,
    traceId,
    scoutLabel: displayScout(bundle.drop?.creatorDisplayName || bundle.drop?.summonerWallet),
    ownerReceivesAll: split.ownerReceivesAll,
    potentialEarnings: potentialEarnings(bundle),
    products: productRows(bundle)
  };
}

export async function generateMetadata({ params }: { params: { brandSlug: string } }): Promise<Metadata> {
  const bundle = await getStorefrontBundleBySlug(params.brandSlug);
  if (!bundle || bundle.drop?.status === "archived") return {};
  const baseUrl = (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const title = `${bundle.drop?.canonicalRootDomain || bundle.brand.hostname}`;
  const description = brandDescription(bundle);
  const image = bundle.ogImage?.imageUrl || (bundle.activeCollection ? `${baseUrl}/api/og/${bundle.activeCollection.id}.png` : undefined);
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${bundle.storefront.slug}` },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${bundle.storefront.slug}`,
      images: image ? [{ url: image, width: 1200, height: 630, alt: `${publicProductCopy(bundle.activeCollection?.title || bundle.brand.name)} OG image` }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export default async function StorefrontPage({
  params,
  searchParams
}: {
  params: { brandSlug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const bundle = await getStorefrontBundleBySlug(params.brandSlug);
  if (!bundle) {
    const submittedUrl = queryValue(searchParams.url);
    if (!submittedUrl) notFound();
    let domain = queryValue(searchParams.domain);
    let canonicalUrl = submittedUrl;
    try {
      const target = canonicalizeDropUrl(submittedUrl);
      domain = domain || target.canonicalRootDomain;
      canonicalUrl = target.canonicalUrl;
    } catch {
      if (!domain) domain = params.brandSlug;
    }
    const title = oneLine(publicProductCopy(queryValue(searchParams.title) || domain), 84);
    const description = oneLine(publicProductCopy(queryValue(searchParams.description) || domain), 150);
    return (
      <DroplinkExperience
        initial={{
          slug: params.brandSlug,
          submittedUrl: canonicalUrl,
          domain,
          favicon: queryValue(searchParams.favicon) || faviconForUrl(canonicalUrl),
          title,
          description,
          state: "empty",
          dropId: null,
          jobId: null,
          traceId: null,
          scoutLabel: null,
          ownerReceivesAll: false,
          potentialEarnings: null,
          products: []
        }}
      />
    );
  }
  if (bundle.drop?.status === "archived") notFound();

  return <DroplinkExperience initial={await viewModelForBundle(bundle)} />;
}
