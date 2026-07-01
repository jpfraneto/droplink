import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DroplinkExperience, type DroplinkState, type DroplinkUser, type DroplinkViewModel } from "@/components/DroplinkExperience";
import { currentUser } from "@/lib/auth";
import { canonicalizeDropUrl } from "@/lib/dropCanonicalization";
import { dropConfig, pricingConfig, x402Config } from "@/lib/env";
import { formatMoney } from "@/lib/productCatalog";
import { centsFromUsd, estimatePrintfulCostCents, estimateStripeFeeCents } from "@/lib/pricing";
import { inferUniversalSlot, publicDropMode } from "@/lib/productValidation";
import { displayScout, OWNER_BPS_WITH_SCOUT, publicDropLinkStatus, revenueSplitForDrop, SCOUT_BPS } from "@/lib/protocol";
import { publicProductCopy } from "@/lib/publicCopy";
import { getGenerationJobByTraceId, getStorefrontBundleBySlug } from "@/lib/store";
import type { StorefrontBundle } from "@/lib/types";

export const dynamic = "force-dynamic";

function brandDescription(bundle: StorefrontBundle): string {
  const study = bundle.brandStudy?.studyJson;
  const description = bundle.activeCollection?.subtitle || study?.essence || study?.what_they_bring_to_the_world || study?.worldview || bundle.brand.hostname;
  return oneLine(publicProductCopy(description, { maxLength: 140 }), 170);
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
  const metadata = bundle.assets.find((asset) => asset.metadataJson?.sourceFavicon)?.metadataJson;
  const favicon = metadata?.sourceFavicon;
  return typeof favicon === "string" && favicon ? favicon : null;
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
  printfulProductId: string | null;
  printfulVariantId: string | null;
  printfulSku: string | null;
  printfulProductName: string | null;
  printfulVariantName: string | null;
  placement: string | null;
  technique: string | null;
  printFileUrl: string | null;
  printImageUrls: string[];
  mockupUrls: string[];
  selectionReason: string | null;
};

function slotLabel(relic: StorefrontBundle["relics"][number]): ProductRow["kindLabel"] {
  const slot = inferUniversalSlot({
    universalSlot: relic.fulfillmentSpecJson?.universalSlot,
    role: relic.fulfillmentSpecJson?.storyRole,
    productFamily: relic.productFamily,
    productName: relic.fulfillmentSpecJson?.productName,
    productType: relic.fulfillmentSpecJson?.productType,
    productCategory: relic.fulfillmentSpecJson?.productCategory
  });
  if (slot === "DISPLAY") return "Display";
  if (slot === "USE") return "Use";
  return "Wear";
}

function productRows(bundle: StorefrontBundle): ProductRow[] {
  const labels = ["Wear", "Display", "Use"] as const;
  const specSku = (spec: StorefrontBundle["relics"][number]["fulfillmentSpecJson"] | null | undefined) => {
    if (!spec || typeof spec !== "object") return null;
    const raw = spec as Record<string, unknown>;
    const value = raw.sku || raw.catalog_variant_sku || raw.variant_sku;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const relicRows: ProductRow[] = bundle.relics.slice(0, 3).map((relic, index) => {
    const sold = bundle.editions.filter((edition) => edition.relicId === relic.id && edition.status === "sold").length;
    const total = relic.totalSupply || 8;
    const spec = relic.fulfillmentSpecJson || null;
    const printImageUrls = bundle.assets
      .filter((asset) => asset.relicId === relic.id && ["print_file", "preview", "lifestyle"].includes(asset.type))
      .map((asset) => asset.url)
      .filter(Boolean);
    const mockupUrls = [
      ...bundle.mockups.filter((entry) => entry.relicId === relic.id).map((entry) => entry.imageUrl),
      ...(spec?.mockupUrls || [])
    ].filter(Boolean);
    return {
      id: relic.id,
      relicId: relic.id,
      kindLabel: slotLabel(relic),
      title: oneLine(publicProductCopy(relic.name, { maxLength: 64 }), 64),
      description: publicProductCopy(relic.description, { maxLength: 180 }).replace(/\s+/g, " ").trim(),
      imageUrl: productImage(bundle, relic.id),
      price: formatMoney(relic.priceCents, "usd"),
      remaining: Math.max(0, total - sold),
      total,
      printfulProductId: relic.printfulProductId || (spec?.catalogProductId ? String(spec.catalogProductId) : null),
      printfulVariantId: relic.printfulVariantId || (spec?.catalogVariantId ? String(spec.catalogVariantId) : null),
      printfulSku: specSku(spec),
      printfulProductName: spec?.productName || relic.productFamily || null,
      printfulVariantName: spec?.variantName || null,
      placement: spec?.placement || null,
      technique: spec?.technique || null,
      printFileUrl: spec?.printFileUrl || bundle.assets.find((asset) => asset.relicId === relic.id && asset.type === "print_file")?.url || null,
      printImageUrls: Array.from(new Set(printImageUrls)),
      mockupUrls: Array.from(new Set(mockupUrls)),
      selectionReason: spec?.selectionReason || relic.whyThisExists || null
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
      total: 8,
      printfulProductId: null,
      printfulVariantId: null,
      printfulSku: null,
      printfulProductName: null,
      printfulVariantName: null,
      placement: null,
      technique: null,
      printFileUrl: null,
      printImageUrls: [],
      mockupUrls: [],
      selectionReason: null
    });
  }
  return relicRows.slice(0, 3);
}

function percentFromBps(bps: number): string {
  return `${bps / 100}%`;
}

function potentialEarnings(bundle: StorefrontBundle): DroplinkViewModel["potentialEarnings"] {
  const priceBook = bundle.drop?.priceBookJson;
  const totals = priceBook?.totals || bundle.drop?.projectedEconomicsJson || null;
  if (totals) {
    const grossCents = centsFromUsd(totals.maxGrossRevenueUsd);
    const printfulCents = centsFromUsd(totals.estimatedTotalPrintfulCostUsd);
    const stripeCents = centsFromUsd(totals.estimatedTotalPaymentFeesUsd);
    const reserveCents = centsFromUsd(totals.estimatedTotalRefundReserveUsd);
    const netCents = centsFromUsd(totals.estimatedTotalNetMarginUsd);
    if (grossCents <= 0) return null;
    return {
      claimer: formatMoney(centsFromUsd(totals.projectedCreatorBountyUsd), "usd"),
      domainOwner: formatMoney(centsFromUsd(totals.projectedDomainOwnerProceedsUsd), "usd"),
      claimerPercent: percentFromBps(SCOUT_BPS),
      domainOwnerPercent: percentFromBps(OWNER_BPS_WITH_SCOUT),
      gross: formatMoney(grossCents, "usd"),
      estimatedCosts: formatMoney(printfulCents + stripeCents + reserveCents, "usd"),
      netMargin: formatMoney(netCents, "usd"),
      basis: "estimated_net"
    };
  }

  let grossCents = 0;
  let printfulCents = 0;
  let stripeCents = 0;
  let reserveCents = 0;
  let netCents = 0;
  for (const relic of bundle.relics) {
    const qty = relic.totalSupply || 8;
    const unitGross = relic.priceCents;
    const unitPrintful = estimatePrintfulCostCents(relic);
    const unitStripe = estimateStripeFeeCents(unitGross);
    const unitReserve = Math.ceil((unitGross * pricingConfig.refundReserveBps) / 10000);
    const unitNet = Math.max(0, unitGross - unitPrintful - unitStripe - unitReserve);
    grossCents += unitGross * qty;
    printfulCents += unitPrintful * qty;
    stripeCents += unitStripe * qty;
    reserveCents += unitReserve * qty;
    netCents += unitNet * qty;
  }
  if (grossCents <= 0) return null;
  return {
    claimer: formatMoney(Math.floor((netCents * SCOUT_BPS) / 10000), "usd"),
    domainOwner: formatMoney(Math.floor((netCents * OWNER_BPS_WITH_SCOUT) / 10000), "usd"),
    claimerPercent: percentFromBps(SCOUT_BPS),
    domainOwnerPercent: percentFromBps(OWNER_BPS_WITH_SCOUT),
    gross: formatMoney(grossCents, "usd"),
    estimatedCosts: formatMoney(printfulCents + stripeCents + reserveCents, "usd"),
    netMargin: formatMoney(netCents, "usd"),
    basis: "estimated_net"
  };
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function stateForBundle(bundle: StorefrontBundle): DroplinkState {
  if (!bundle.activeCollection || bundle.relics.length < 3) return "processing";
  return publicDropLinkStatus(bundle.drop) as DroplinkState;
}

function publicUser(user: { id: string; username: string; displayName: string; avatarUrl?: string | null } | null | undefined): DroplinkUser | null {
  return user
    ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null
      }
    : null;
}

async function viewModelForBundle(bundle: StorefrontBundle, viewer: Awaited<ReturnType<typeof currentUser>>): Promise<DroplinkViewModel> {
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
    scoutLabel: bundle.scoutUser ? `@${bundle.scoutUser.username}` : displayScout(bundle.drop?.creatorDisplayName || bundle.drop?.summonerWallet),
    scoutUser: publicUser(bundle.scoutUser),
    claimedLabel: bundle.drop?.domainOwnerName || bundle.drop?.domainOwnerEmail || bundle.drop?.domainOwnerWallet || null,
    currentUser: publicUser(viewer),
    x402: {
      amountUsdc: dropConfig.summonPriceUsdc,
      network: x402Config.network,
      asset: x402Config.acceptedAsset,
      recipientAddress: x402Config.recipientAddress
    },
    ownerReceivesAll: split.ownerReceivesAll,
    publicMode: publicDropMode({ drop: bundle.drop, storefront: bundle.storefront }),
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
  const viewer = await currentUser();
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
          favicon: queryValue(searchParams.favicon) || null,
          title,
          description,
          state: "empty",
          dropId: null,
          jobId: null,
          traceId: null,
          scoutLabel: null,
          scoutUser: null,
          claimedLabel: null,
          currentUser: publicUser(viewer),
          x402: {
            amountUsdc: dropConfig.summonPriceUsdc,
            network: x402Config.network,
            asset: x402Config.acceptedAsset,
            recipientAddress: x402Config.recipientAddress
          },
          ownerReceivesAll: false,
          publicMode: "scouted_unclaimed",
          potentialEarnings: null,
          products: []
        }}
      />
    );
  }
  if (bundle.drop?.status === "archived") notFound();

  return <DroplinkExperience initial={await viewModelForBundle(bundle, viewer)} />;
}
