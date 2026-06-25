import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DropProductCard } from "@/components/DropProductCard";
import { ThemeLink } from "@/components/ThemeLink";
import { formatMoney } from "@/lib/productCatalog";
import { publicProductCopy } from "@/lib/publicCopy";
import { themeFromBrand } from "@/lib/brandTheme";
import { getStorefrontBundleBySlug } from "@/lib/store";
import type { StorefrontBundle } from "@/lib/types";

export const dynamic = "force-dynamic";
const githubUrl = "https://github.com/jpfraneto/droplink";

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}

function recordString(input: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function printfulLink(relic: StorefrontBundle["relics"][number]): string {
  const spec = relic.fulfillmentSpecJson;
  const snapshot = isRecord(spec?.rawPrintfulCatalogSnapshotJson) ? spec.rawPrintfulCatalogSnapshotJson : undefined;
  const product = isRecord(snapshot?.product) ? snapshot.product : undefined;
  const directUrl = recordString(product, ["url", "product_url", "permalink", "canonical_url", "web_url"]);
  if (directUrl?.startsWith("http")) return directUrl;
  const productId = spec?.catalogProductId || relic.printfulProductId;
  return productId
    ? `https://www.printful.com/dashboard/custom-products/catalog/product/${productId}`
    : "https://www.printful.com/dashboard/custom-products";
}

function cssImageUrl(input: string): string {
  return `url("${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

function brandDescription(bundle: StorefrontBundle): string {
  const study = bundle.brandStudy?.studyJson;
  return (
    study?.what_they_bring_to_the_world ||
    study?.essence ||
    study?.worldview ||
    publicProductCopy(bundle.activeCollection?.subtitle || `A finite merch drop for ${bundle.brand.hostname}.`)
  );
}

export async function generateMetadata({ params }: { params: { brandSlug: string } }): Promise<Metadata> {
  const bundle = await getStorefrontBundleBySlug(params.brandSlug);
  if (!bundle || bundle.drop?.status === "archived" || !bundle.activeCollection) return {};
  const baseUrl = (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const title = `${bundle.drop?.canonicalRootDomain || bundle.brand.hostname} finite DropLink`;
  const description = publicProductCopy(bundle.activeCollection.subtitle);
  const image = bundle.ogImage?.imageUrl || `${baseUrl}/api/og/${bundle.activeCollection.id}.png`;
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${bundle.storefront.slug}` },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${bundle.storefront.slug}`,
      images: [{ url: image, width: 1200, height: 630, alt: `${publicProductCopy(bundle.activeCollection.title)} OG image` }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export default async function StorefrontPage({
  params,
  searchParams
}: {
  params: { brandSlug: string };
  searchParams: { success?: string; session_id?: string };
}) {
  const bundle = await getStorefrontBundleBySlug(params.brandSlug);
  if (!bundle || bundle.drop?.status === "archived" || !bundle.activeCollection) notFound();
  const dropStatus = bundle.drop?.status || "summoned";
  const commerceOpen = dropStatus === "published";
  const theme = themeFromBrand(bundle.brand);
  const domainVerified = bundle.drop?.domainClaimStatus === "verified" || bundle.storefront.claimStatus === "verified";
  const publicBaseUrl = (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const publicHost = publicBaseUrl.replace(/^https?:\/\//, "");
  const ogImageUrl = bundle.ogImage?.imageUrl || `${publicBaseUrl}/api/og/${bundle.activeCollection.id}.png`;
  const description = brandDescription(bundle);
  const style = {
    "--store-primary": theme.primary,
    "--store-secondary": theme.secondary,
    "--store-accent": theme.accent,
    "--store-deep": theme.deep,
    "--store-og-image": cssImageUrl(ogImageUrl)
  } as CSSProperties;

  return (
    <main className="simple-drop-page" style={style}>
      <div className="simple-drop-shell">
        <header className="simple-drop-title">
          <h1>{bundle.brand.name}</h1>
          <p>{description}</p>
        </header>
        <section className="simple-products" aria-label="Products">
          {bundle.relics.map((relic) => {
            const editions = bundle.editions.filter((edition) => edition.relicId === relic.id);
            const claimed = editions.filter((edition) => edition.status === "sold").length;
            const left = Math.max(0, relic.totalSupply - claimed);
            const mockup = bundle.mockups.find((entry) => entry.relicId === relic.id);
            const preview = bundle.assets.find((entry) => entry.relicId === relic.id && entry.type === "preview");
            const variantId = String(relic.fulfillmentSpecJson?.catalogVariantId || relic.printfulVariantId || "");
            const productName = relic.fulfillmentSpecJson?.productName || relic.productFamily || relic.name;
            const variantName = relic.fulfillmentSpecJson?.variantName || variantId;
            const printfulName = `${productName}${variantName ? ` · ${variantName}` : ""}${variantId ? ` · #${variantId}` : ""}`;
            return (
              <DropProductCard
                key={relic.id}
                relicId={relic.id}
                imageUrl={mockup?.imageUrl || preview?.url || ""}
                title={relic.name || `Product ${relic.relicIndex || ""}`.trim()}
                description={publicProductCopy(relic.description)}
                printfulName={printfulName}
                printfulUrl={printfulLink(relic)}
                price={formatMoney(relic.priceCents, relic.currency)}
                unitsLeft={left}
                commerceOpen={commerceOpen}
              />
            );
          })}
        </section>
        <footer className="simple-footer">
          <a className="simple-footer-link" href={githubUrl} target="_blank" rel="noreferrer">
            github
          </a>
          <Link className="simple-footer-link" href="/about">
            about
          </Link>
          {domainVerified ? (
            <span>claim</span>
          ) : (
            <form action="/api/claims/start" method="post">
              <input type="hidden" name="storefrontId" value={bundle.storefront.id} />
              <button className="simple-footer-link" type="submit">
                claim
              </button>
            </form>
          )}
          <ThemeLink />
          <span>{publicHost}/{bundle.storefront.slug}</span>
        </footer>
      </div>
    </main>
  );
}
