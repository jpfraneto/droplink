import Link from "next/link";
import { UrlInput } from "@/components/UrlInput";
import { getProductsForDrop, listDrops } from "@/lib/store";

export default async function HomePage() {
  const drops = (await listDrops()).slice(0, 3);
  const gallery = await Promise.all(
    drops.map(async (drop) => ({
      drop,
      products: await getProductsForDrop(drop.id)
    }))
  );

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
          <span className="badge">every link becomes three products</span>
        </header>
        <section className="hero">
          <h1>paste any link. get a merch drop.</h1>
          <p>DropLink turns any public URL into a storefront with 3 products.</p>
          <UrlInput />
        </section>
        <section className="section">
          <h2 className="section-title">Latest storefronts</h2>
          <div className="latest-list">
            {gallery.length ? (
              gallery.map(({ drop, products }) => (
                <Link className="latest-row" key={drop.id} href={`/d/${drop.slug}`}>
                  <img className="latest-image" src={drop.ogImageUrl} alt={`${drop.collectionName} storefront summary`} />
                  <div className="latest-meta">
                    <strong>{drop.collectionName}</strong>
                    <span>{drop.sourceUrl}</span>
                    <small>{products.map((product) => product.name).join(" | ")}</small>
                  </div>
                </Link>
              ))
            ) : (
              <div className="latest-empty">
                <strong>No storefronts generated yet.</strong>
                <span>Paste a public URL to create the first merch drop.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
