import { NextResponse } from "next/server";
import { getDropById, getJob } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const drop = job.dropId ? await getDropById(job.dropId) : null;
  return NextResponse.json({
    id: job.id,
    status: job.status,
    logs: job.logsJson,
    dropId: job.dropId,
    url: drop ? `/d/${drop.slug}` : null,
    error: job.error
  });
}
