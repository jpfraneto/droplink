import { NextResponse } from "next/server";
import { getGenerationJob, getStorefrontBundleById } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getGenerationJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const bundle = job.storefrontId ? await getStorefrontBundleById(job.storefrontId) : null;
  return NextResponse.json({ job, storefront: bundle?.storefront || null });
}
