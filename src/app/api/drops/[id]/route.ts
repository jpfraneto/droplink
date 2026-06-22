import { NextResponse } from "next/server";
import { getDropById, getProductsForDrop } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const drop = await getDropById(params.id);
  if (!drop) return NextResponse.json({ error: "Drop not found." }, { status: 404 });
  const products = await getProductsForDrop(drop.id);
  return NextResponse.json({ drop, products });
}
