import { NextResponse } from "next/server";
import { verifyTempoPayout } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await verifyTempoPayout(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify Tempo payout DNS." }, { status: 400 });
  }
}
