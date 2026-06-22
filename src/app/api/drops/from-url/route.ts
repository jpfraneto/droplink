import { NextResponse } from "next/server";
import { z } from "zod";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { generateDropFromUrl } from "@/lib/generateDrop";
import { newId } from "@/lib/hashes";
import { createJob, updateJob } from "@/lib/store";

const requestSchema = z.object({
  url: z.string().min(8)
});

export async function POST(request: Request) {
  if (!hasGenerationAccess(request)) {
    return NextResponse.json({ error: "Drop generation is currently manual. Missing admin generation key." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const job = await createJob({
    id: newId("job"),
    type: "from_url",
    status: "running",
    inputJson: {},
    logsJson: ["queued URL generation..."],
    error: null,
    dropId: null,
    createdAt: now,
    updatedAt: now
  });

  try {
    const body = requestSchema.parse(await request.json());
    await updateJob(job.id, { inputJson: body, logsJson: ["reading the link..."] });
    const { drop, logs } = await generateDropFromUrl(body.url);
    await updateJob(job.id, {
      status: "completed",
      logsJson: logs,
      dropId: drop.id
    });

    return NextResponse.json({
      jobId: job.id,
      dropId: drop.id,
      slug: drop.slug,
      status: drop.status,
      url: `/d/${drop.slug}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate a drop.";
    await updateJob(job.id, { status: "failed", error: message, logsJson: ["generation failed"] });
    return NextResponse.json({ jobId: job.id, error: message }, { status: 400 });
  }
}
