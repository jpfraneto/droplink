import { NextResponse } from "next/server";
import { z } from "zod";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { logger } from "@/lib/logger";
import { enqueueGeneration } from "@/lib/queues";
import { redirectTo } from "@/lib/redirects";
import { brandSlugFromUrl } from "@/lib/slugs";
import { withDefaultHttpsScheme } from "@/lib/urls";

const schema = z.object({
  url: z.string().min(8)
});

export async function POST(request: Request) {
  if (!hasGenerationAccess(request)) {
    return NextResponse.json({ error: "Missing admin generation key." }, { status: 401 });
  }
  const contentType = request.headers.get("content-type") || "";
  const raw =
    contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  const body = schema.parse(raw);
  try {
    const job = await enqueueGeneration({
      url: body.url,
      requestId: request.headers.get("x-request-id")
    });
    logger.info("admin.generate.queued", {
      jobId: job.id,
      traceId: job.traceId,
      url: body.url
    });
    if (contentType.includes("application/json")) return NextResponse.json({ jobId: job.id, traceId: job.traceId });
    const slug = typeof job.inputJson.slug === "string" ? job.inputJson.slug : brandSlugFromUrl(withDefaultHttpsScheme(body.url));
    return redirectTo(request, `/admin/${slug}?job=${job.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    logger.error("admin.generate.failed", { error: message, url: body.url });
    if (contentType.includes("application/json")) return NextResponse.json({ error: message }, { status: 400 });
    return redirectTo(request, `/admin?error=${encodeURIComponent(message)}`);
  }
}
