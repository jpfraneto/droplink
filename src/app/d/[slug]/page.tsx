import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { formatMoney } from "@/lib/productCatalog";
import { themeFromDrop } from "@/lib/brandTheme";
import { getDropBySlug, getProductsForDrop } from "@/lib/store";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const drop = await getDropBySlug(params.slug);
  if (!drop) return {};

  return {
    title: `${drop.collectionName} | DropLink`,
    description: drop.collectionTagline,
    openGraph: {
      title: `${drop.collectionName} | DropLink`,
      description: "this link became a drop.",
      images: [{ url: drop.ogImageUrl, width: 1200, height: 630, alt: `${drop.collectionName} share image` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${drop.collectionName} | DropLink`,
      description: "this link became a drop.",
      images: [drop.ogImageUrl]
    }
  };
}

export default async function DropPage({
  params
}: {
  params: { slug: string };
}) {
  const drop = await getDropBySlug(params.slug);
  if (!drop) notFound();
  const products = await getProductsForDrop(drop.id);
  const theme = themeFromDrop(drop);
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
          <span>generated from your link</span>
        </header>
        <section className="store-hero">
          <div className="store-sigil" aria-hidden="true" />
          <h1>{drop.collectionName}</h1>
          <p>3 products from this link.</p>
        </section>
        <section className="store-products" aria-label="Products">
          {products.map((product) => (
            <article className="store-card" key={product.id}>
              <img src={product.imageUrl || product.mockupUrl} alt={product.name} />
              <div className="store-card-body">
                <h2>{product.name}</h2>
                <p>{product.description}</p>
                <strong>{formatMoney(product.priceCents, product.currency)}</strong>
                <CheckoutButton dropId={drop.id} productId={product.id} />
              </div>
            </article>
          ))}
        </section>
        <footer className="store-footer">
          generated from{" "}
          <a href={drop.sourceUrl} target="_blank" rel="noreferrer">
            {drop.sourceUrl}
          </a>{" "}
          by <Link href="/">DropLink</Link>
        </footer>
      </div>
    </main>
  );
}
