import { NextResponse } from "next/server";
import { z } from "zod";
import { startTempoPayout } from "@/lib/store";

const schema = z.object({
  walletAddress: z.string().min(3),
  chain: z.string().optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await request.json());
    const result = await startTempoPayout(params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Tempo payout setup." }, { status: 400 });
  }
}
