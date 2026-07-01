import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { getDropBundleByDropId } from "@/lib/store";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const bundle = await getDropBundleByDropId(params.id);
  if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
  if (!bundle.drop.stripeConnectAccountId) return NextResponse.json({ error: "No Stripe Connect account exists for this DropLink." }, { status: 400 });
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  const link = await stripe.accounts.createLoginLink(bundle.drop.stripeConnectAccountId);
  return NextResponse.json({ url: link.url, accountId: bundle.drop.stripeConnectAccountId });
}
