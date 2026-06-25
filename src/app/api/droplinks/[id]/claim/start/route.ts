import { NextResponse } from "next/server";
import { z } from "zod";
import { getDropBundleByDropId, startDnsClaim } from "@/lib/store";

const schema = z.object({
  claimantWallet: z.string().min(3).optional(),
  claimantEmail: z.string().email().optional(),
  claimantName: z.string().optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await request.json());
    const bundle = await getDropBundleByDropId(params.id);
    if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
    const claim = await startDnsClaim(bundle.storefront.id, body);
    return NextResponse.json({
      dropId: params.id,
      canonicalRootDomain: bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain,
      txtName: claim.txtName,
      txtValue: claim.txtValue,
      claim
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start DNS claim." }, { status: 400 });
  }
}
