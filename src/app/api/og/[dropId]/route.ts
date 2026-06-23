import { NextResponse } from "next/server";
import { ogPng } from "@/lib/og";
import { listStorefrontBundles } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { dropId: string } }) {
  const id = params.dropId.replace(/\.png$/, "");
  const bundles = await listStorefrontBundles();
  const bundle = bundles.find((entry) => entry.activeCollection?.id === id || entry.ogImage?.id === id);
  if (!bundle || !bundle.activeCollection) return NextResponse.json({ error: "OG image not found." }, { status: 404 });
  const png = await ogPng(bundle.brand, bundle.activeCollection, bundle.relics);

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600"
    }
  });
}
