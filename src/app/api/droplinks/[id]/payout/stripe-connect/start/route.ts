import { NextResponse } from "next/server";
import { requestBaseUrl } from "@/lib/redirects";
import { startStripeConnectPayout } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await startStripeConnectPayout(params.id, { baseUrl: requestBaseUrl(request) });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Stripe Connect payout setup." }, { status: 400 });
  }
}
