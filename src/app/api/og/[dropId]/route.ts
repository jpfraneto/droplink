import { NextResponse } from "next/server";
import { ogPng } from "@/lib/og";
import { listStorefrontBundles } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { dropId: string } }) {
  const id = params.dropId.replace(/\.png$/, "");
  const bundles = await listStorefrontBundles();
  const bundle = bundles.find((entry) => entry.activeCollection?.id === id || entry.ogImage?.id === id);
  if (!bundle || !bundle.activeCollection) return NextResponse.json({ error: "OG image not found." }, { status: 404 });
  const baseUrl = (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "https://droplink.lat").replace(/\/$/, "");
  const publicPath = `${baseUrl.replace(/^https?:\/\//, "")}/${bundle.storefront.slug}`;
  const imageUrls = bundle.relics.map((relic) => {
    const mockup = bundle.mockups.find((entry) => entry.relicId === relic.id);
    const preview = bundle.assets.find((entry) => entry.relicId === relic.id && entry.type === "preview");
    return mockup?.imageUrl || preview?.url;
  });
  const png = await ogPng(bundle.brand, bundle.activeCollection, bundle.relics, { imageUrls, publicPath });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600"
    }
  });
}
