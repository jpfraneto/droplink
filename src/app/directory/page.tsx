import Link from "next/link";
import { publicProductCopy } from "@/lib/publicCopy";
import { isGeneratedStorefrontVisible, listStorefrontBundles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const droplinks = (await listStorefrontBundles())
    .filter((bundle) => isGeneratedStorefrontVisible(bundle))
    .map((bundle) => ({
      id: bundle.storefront.id,
      slug: bundle.storefront.slug,
      brandName: bundle.brand.name,
      hostname: bundle.brand.hostname,
      imageUrl: bundle.ogImage?.imageUrl || (bundle.activeCollection ? `/api/og/${bundle.activeCollection.id}.png` : ""),
      title: publicProductCopy(bundle.activeCollection?.title || bundle.brand.name),
      products: bundle.relics.map((relic) => publicProductCopy(relic.name)),
      sold: bundle.relics.reduce((sum, relic) => sum + relic.soldCount, 0),
      total: bundle.relics.reduce((sum, relic) => sum + relic.totalSupply, 0)
    }));

  return (
    <main className="directory-page">
      <section className="directory-shell">
        <header className="directory-nav">
          <Link className="brand-drop-back" href="/" aria-label="Back to DropLink">
            ←
          </Link>
          <div>
            <strong>DropLink</strong>
            <span>Generated droplinks</span>
          </div>
        </header>


        <div className="directory-list">
          {droplinks.map((item) => (
            <Link className="directory-row" key={item.id} href={`/${item.slug}`}>
              {item.imageUrl ? <img src={item.imageUrl} alt={`${item.brandName} droplink`} /> : <span className="directory-image-fallback" aria-hidden="true" />}
              <span className="directory-copy">
                <strong>{item.brandName}</strong>
                <em>{item.hostname}</em>
                <span>{item.title}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
