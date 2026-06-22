import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { formatMoney } from "@/lib/productCatalog";
import { getDropBySlug, getProductBySlug } from "@/lib/store";

export default async function ProductPage({ params }: { params: { slug: string; productSlug: string } }) {
  const drop = await getDropBySlug(params.slug);
  if (!drop) notFound();
  const product = await getProductBySlug(drop.id, params.productSlug);
  if (!product) notFound();

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
          <Link className="badge" href={`/d/${drop.slug}`}>
            back to full drop
          </Link>
        </header>
        <section className="product-detail">
          <img className="product-image card" src={product.mockupUrl} alt={`${product.name} mockup`} />
          <div>
            <span className="pill">{product.type}</span>
            <h1 style={{ fontSize: "clamp(42px, 7vw, 78px)", lineHeight: 0.95, margin: "18px 0 14px" }}>
              {product.name}
            </h1>
            <p className="price" style={{ fontSize: 28 }}>
              {formatMoney(product.priceCents, product.currency)}
            </p>
            <p className="muted" style={{ fontSize: 20, lineHeight: 1.5 }}>
              {product.description}
            </p>
            <section className="section" style={{ paddingTop: 18 }}>
              <h2 className="section-title">Why it belongs</h2>
              <p className="muted" style={{ lineHeight: 1.55 }}>
                {product.whyThisProduct}
              </p>
            </section>
            <CheckoutButton dropId={drop.id} productId={product.id} label="BUY NOW" />
            <p className="muted" style={{ marginTop: 14 }}>
              Preview checkout uses Stripe test mode when configured. Live third-party sales require claim approval.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
