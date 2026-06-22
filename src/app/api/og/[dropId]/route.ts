import { NextResponse } from "next/server";
import { ogPng } from "@/lib/og";
import { getDropById, getProductsForDrop } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { dropId: string } }) {
  const drop = await getDropById(params.dropId.replace(/\.png$/, ""));
  if (!drop) return NextResponse.json({ error: "Drop not found." }, { status: 404 });
  const products = await getProductsForDrop(drop.id);
  const png = await ogPng(drop, products);

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600"
    }
  });
}
