import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { getDropBundleByDropId, reviewReadiness } from "@/lib/store";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const bundle = await getDropBundleByDropId(params.id);
  if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
  return NextResponse.json({ dropId: params.id, readiness: reviewReadiness(bundle) });
}
