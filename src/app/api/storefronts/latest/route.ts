import { NextResponse } from "next/server";
import { publicProductCopy } from "@/lib/publicCopy";
import { isGeneratedStorefrontVisible, listStorefrontBundles } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const storefronts = (await listStorefrontBundles())
    .filter((bundle) => isGeneratedStorefrontVisible(bundle))
    .slice(0, 12)
    .map((bundle) => ({
      id: bundle.storefront.id,
      slug: bundle.storefront.slug,
      brandName: bundle.brand.name,
      hostname: bundle.brand.hostname,
      imageUrl: bundle.ogImage?.imageUrl || (bundle.activeCollection ? `/api/og/${bundle.activeCollection.id}.png` : ""),
      title: publicProductCopy(bundle.activeCollection?.title || bundle.brand.name),
      products: bundle.relics.map((relic) => relic.name),
      sold: bundle.relics.reduce((sum, relic) => sum + relic.soldCount, 0),
      total: bundle.relics.reduce((sum, relic) => sum + relic.totalSupply, 0)
    }));

  return NextResponse.json({ storefronts, generatedAt: new Date().toISOString() });
}
