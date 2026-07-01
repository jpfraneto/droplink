import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy checkout endpoint disabled. Use /api/droplinks/:id/checkout so the DropLink, relic, and edition reservation are all verified together."
    },
    { status: 410 }
  );
}
