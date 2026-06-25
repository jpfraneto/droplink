import Link from "next/link";
import { LatestDroplinks } from "@/components/LatestDroplinks";
import { publicProductCopy } from "@/lib/publicCopy";
import { listStorefrontBundles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefronts = (await listStorefrontBundles())
    .filter((bundle) => bundle.drop?.status === "published" || bundle.drop?.status === "sold_out")
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
          <h1 className="hero-title">Turn any link into a finite merch drop.</h1>
          <p>
            Paste a link. Pay 8 USDC to process it. If the owner of the domain, verified via a _txt record on DNS, claims it you get 8% of the revenue. 3 relics, 8 items each. 24 SKUs. When sold out it is sold out forever.
          </p>
        </section>
        <LatestDroplinks initial={storefronts} />
      </div>
    </main>
  );
}
