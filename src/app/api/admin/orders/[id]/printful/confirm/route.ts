import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { confirmExistingPrintfulOrder } from "@/lib/fulfillment";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await confirmExistingPrintfulOrder({ orderId: params.id, requestId: request.headers.get("x-request-id") });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not confirm Printful order." }, { status: 400 });
  }
}
