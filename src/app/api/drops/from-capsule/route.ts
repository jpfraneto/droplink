import { NextResponse } from "next/server";
import { z } from "zod";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { generateDropFromCapsule } from "@/lib/generateDrop";
import { newId } from "@/lib/hashes";
import { createJob, updateJob } from "@/lib/store";

const requestSchema = z.object({
  capsule: z.unknown(),
  source: z.string().optional(),
  agent: z
    .object({
      name: z.string().optional(),
      version: z.string().optional()
    })
    .optional()
});

export async function POST(request: Request) {
  if (!hasGenerationAccess(request)) {
    return NextResponse.json({ error: "Drop generation is currently manual. Missing admin generation key." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const raw = await request.json();
  const body = requestSchema.safeParse(raw).success
    ? requestSchema.parse(raw)
    : { capsule: raw, source: "api", agent: undefined };
  const job = await createJob({
    id: newId("job"),
    type: "from_capsule",
    status: "running",
    inputJson: { source: body.source || "api", agent: body.agent || null },
    logsJson: ["validating the capsule..."],
    error: null,
    dropId: null,
    createdAt: now,
    updatedAt: now
  });

  try {
    const { drop, logs } = await generateDropFromCapsule(body.capsule);
    await updateJob(job.id, { status: "completed", logsJson: logs, dropId: drop.id });
    return NextResponse.json({
      jobId: job.id,
      dropId: drop.id,
      drop_id: drop.id,
      slug: drop.slug,
      url: `/d/${drop.slug}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create drop from capsule.";
    await updateJob(job.id, { status: "failed", error: message, logsJson: ["capsule generation failed"] });
    return NextResponse.json({ jobId: job.id, error: message }, { status: 400 });
  }
}
