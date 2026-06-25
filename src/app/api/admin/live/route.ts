import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import {
  getGenerationJob,
  getGenerationJobByTraceId,
  getStorefrontBundleById,
  listGenerationJobs,
  listSystemEventsByTraceId,
  reviewReadiness
} from "@/lib/store";

export async function GET(request: Request) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const storefrontId = url.searchParams.get("storefrontId");

  const selectedBundle = storefrontId ? await getStorefrontBundleById(storefrontId) : null;
  const selectedJob =
    jobId
      ? await getGenerationJob(jobId)
      : selectedBundle?.storefront.generationTraceId
        ? await getGenerationJobByTraceId(selectedBundle.storefront.generationTraceId)
        : null;
  const bundle =
    selectedBundle ||
    (selectedJob?.storefrontId ? await getStorefrontBundleById(selectedJob.storefrontId) : null);
  const traceId = selectedJob?.traceId || bundle?.storefront.generationTraceId || null;
  const events = traceId ? await listSystemEventsByTraceId(traceId) : bundle?.events || [];
  const readiness = bundle ? reviewReadiness(bundle) : null;
  const jobs = await listGenerationJobs(24);

  return NextResponse.json({
    now: new Date().toISOString(),
    job: selectedJob,
    jobs,
    traceId,
    bundle,
    readiness,
    events
  });
}
