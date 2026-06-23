import { NextResponse } from "next/server";
import { relicMockupSvg } from "@/lib/mockups";
import { listStorefrontBundles } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { productId: string } }) {
  const id = params.productId.replace(/\.svg$/, "");
  const bundles = await listStorefrontBundles();
  const bundle = bundles.find((entry) => entry.relics.some((relic) => relic.id === id));
  const relic = bundle?.relics.find((entry) => entry.id === id);
  if (!bundle || !relic) return NextResponse.json({ error: "Relic not found." }, { status: 404 });

  return new NextResponse(relicMockupSvg(bundle.brand, relic), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
