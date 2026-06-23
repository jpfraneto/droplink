import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Drop capsules belonged to the old demo model. Use /api/admin/generate with a public brand URL so DropLink can create a storefront, collection, relics, and editions."
    },
    { status: 410 }
  );
}
