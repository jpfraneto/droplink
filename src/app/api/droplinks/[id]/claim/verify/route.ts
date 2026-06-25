import { NextResponse } from "next/server";
import { verifyDropClaim } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const claim = await verifyDropClaim(params.id);
    return NextResponse.json({ verified: true, claim });
  } catch (error) {
    return NextResponse.json({ verified: false, error: error instanceof Error ? error.message : "Could not verify DNS claim." }, { status: 400 });
  }
}
