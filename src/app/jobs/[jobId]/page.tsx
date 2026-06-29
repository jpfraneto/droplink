import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoutProgress } from "@/components/ScoutProgress";
import { getGenerationJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: { jobId: string } }) {
  const job = await getGenerationJob(params.jobId);
  if (!job) notFound();

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
          <span className="badge">{job.status}</span>
        </header>
        <ScoutProgress jobId={job.id} />
      </div>
    </main>
  );
}
