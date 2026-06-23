import Link from "next/link";
import { LatestDroplinks } from "@/components/LatestDroplinks";
import { publicProductCopy } from "@/lib/publicCopy";
import { isPublicStorefrontReady, listStorefrontBundles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefronts = (await listStorefrontBundles())
    .filter((bundle) => isPublicStorefrontReady(bundle))
    .slice(0, 12)
    .map((bundle) => ({
      id: bundle.storefront.id,
      slug: bundle.storefront.slug,
      brandName: bundle.brand.name,
      hostname: bundle.brand.hostname,
      imageUrl:
        bundle.ogImage?.imageUrl ||
        `/api/og/${bundle.activeCollection?.id}.png`,
      title: publicProductCopy(
        bundle.activeCollection?.title || bundle.brand.name,
      ),
      products: bundle.relics.map((relic) => relic.name),
      sold: bundle.relics.reduce((sum, relic) => sum + relic.soldCount, 0),
      total: bundle.relics.reduce((sum, relic) => sum + relic.totalSupply, 0),
    }));

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
        </header>
        <section className="hero">
          <h1 className="hero-title">paste any link. get a merch drop.</h1>
          <p>
            DropLink studies your brand and distills it into 3 unique products
            people can buy immediately.
          </p>
        </section>
        <LatestDroplinks initial={storefronts} />
      </div>
    </main>
  );
}
