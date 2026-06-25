import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { mockupUrlsFromTask, pollPrintfulMockupTask } from "@/lib/printful";
import { getDropBundleByDropId, recordEvent, reviewReadiness, updateRelicMockupResult } from "@/lib/store";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const bundle = await getDropBundleByDropId(params.id);
  if (!bundle?.drop) return NextResponse.json({ error: "DropLink not found." }, { status: 404 });
  const results = [];
  for (const mockup of bundle.mockups) {
    if (!mockup.printfulTaskId || mockup.status === "ready") continue;
    const task = await pollPrintfulMockupTask(mockup.printfulTaskId, {
      requestId: request.headers.get("x-request-id"),
      traceId: bundle.storefront.generationTraceId || null
    });
    const urls = mockupUrlsFromTask(task);
    await updateRelicMockupResult({
      relicId: mockup.relicId,
      mockupId: mockup.id,
      status: urls.length ? "ready" : "pending",
      imageUrl: urls[0] || null,
      mockupUrls: urls
    });
    results.push({ mockupId: mockup.id, taskId: mockup.printfulTaskId, status: urls.length ? "ready" : "pending", urls });
  }
  const refreshed = await getDropBundleByDropId(params.id);
  const readiness = refreshed ? reviewReadiness(refreshed) : null;
  await recordEvent({
    entityType: "drop",
    entityId: params.id,
    eventType: "printful_mockups_refreshed",
    level: "info",
    message: "Admin refreshed Printful mockup tasks.",
    metadataJson: { results, blockers: readiness?.blockers || [] },
    requestId: request.headers.get("x-request-id"),
    traceId: bundle.storefront.generationTraceId || null
  });
  return NextResponse.json({ results, readiness });
}
