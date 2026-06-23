import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { ClaimBanner } from "@/components/ClaimBanner";
import { formatMoney } from "@/lib/productCatalog";
import { publicProductCopy } from "@/lib/publicCopy";
import { themeFromBrand } from "@/lib/brandTheme";
import { getStorefrontBundleBySlug, isPublicStorefrontReady } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { brandSlug: string } }): Promise<Metadata> {
  const bundle = await getStorefrontBundleBySlug(params.brandSlug);
  if (!bundle || !isPublicStorefrontReady(bundle) || !bundle.activeCollection) return {};
  const baseUrl = (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const title = `${bundle.brand.name} merch drop | DropLink`;
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
  if (!bundle || !isPublicStorefrontReady(bundle) || !bundle.activeCollection) notFound();
  const theme = themeFromBrand(bundle.brand);
  const collectionTitle = publicProductCopy(bundle.activeCollection.title);
  const collectionSubtitle = publicProductCopy(bundle.activeCollection.subtitle);
  const style = {
    "--store-primary": theme.primary,
    "--store-secondary": theme.secondary,
    "--store-accent": theme.accent,
    "--store-deep": theme.deep
  } as CSSProperties;

  return (
    <main className="storefront-page" style={style}>
      <div className="storefront-shell">
        <header className="store-nav">
          <Link className="store-brand" href="/">
            DropLink
          </Link>
          <span>{collectionSubtitle}</span>
        </header>
        {searchParams.success ? (
          <section className="success-banner">
            <strong>Order received.</strong>
            <span>Your limited product was claimed. This smoke test used mock checkout.</span>
          </section>
        ) : null}
        <section className="store-hero">
          <div className="store-sigil" aria-hidden="true" />
          <h1>{bundle.brand.name}</h1>
          <p>{collectionTitle}</p>
        </section>
        <section className="store-products" aria-label="Products">
          {bundle.relics.map((relic) => {
            const editions = bundle.editions.filter((edition) => edition.relicId === relic.id);
            const claimed = editions.filter((edition) => edition.status === "sold").length;
            const left = Math.max(0, relic.totalSupply - claimed);
            const soldOut = left === 0 || relic.status === "sold_out";
            const mockup = bundle.mockups.find((entry) => entry.relicId === relic.id);
            return (
              <article className="store-card" key={relic.id}>
                <img src={mockup?.imageUrl || `/api/mockups/${relic.id}.svg`} alt={relic.name} />
                <div className="store-card-body">
                  <span className="store-kicker">limited product</span>
                  <h2>{relic.name}</h2>
                  <p>{relic.description}</p>
                  <p className="store-scarcity">
                    {claimed} / {relic.totalSupply} claimed · {left} left
                  </p>
                  <strong>{formatMoney(relic.priceCents, relic.currency)}</strong>
                  {soldOut ? (
                    <button className="btn secondary" type="button" disabled>
                      SOLD OUT
                    </button>
                  ) : (
                    <CheckoutButton relicId={relic.id} label="BUY NOW" />
                  )}
                </div>
              </article>
            );
          })}
        </section>
        <ClaimBanner bundle={bundle} />
        <footer className="store-footer">
          generated from{" "}
          <a href={bundle.brand.canonicalUrl} target="_blank" rel="noreferrer">
            {bundle.brand.hostname}
          </a>{" "}
          by <Link href="/">DropLink</Link>
        </footer>
      </div>
    </main>
  );
}
