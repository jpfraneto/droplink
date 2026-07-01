import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { releaseOrderPayout } from "@/lib/payouts";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { beneficiaryType?: "creator" | "domain_owner" | "protocol"; adminOverride?: boolean };
  try {
    const result = await releaseOrderPayout({
      orderId: params.id,
      beneficiaryType: body.beneficiaryType,
      adminOverride: Boolean(body.adminOverride),
      requestId: request.headers.get("x-request-id")
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not release payout." }, { status: 400 });
  }
}
