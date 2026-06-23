import { NextResponse } from "next/server";
import { getStorefrontBundleById } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const bundle = await getStorefrontBundleById(params.id);
  if (!bundle) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
  return NextResponse.json({ bundle });
}
