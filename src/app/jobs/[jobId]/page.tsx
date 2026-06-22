import Link from "next/link";
import { notFound } from "next/navigation";
import { getDropById, getJob } from "@/lib/store";

const stages = [
  "reading the link...",
  "extracting the brand...",
  "finding the lore...",
  "choosing 3 products...",
  "generating mockups...",
  "building the storefront...",
  "creating the share image..."
];

export default async function JobPage({ params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId);
  if (!job) notFound();
  const drop = job.dropId ? await getDropById(job.dropId) : null;

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
          <span className="badge">{job.status}</span>
        </header>
        <section className="hero">
          <h1>building the drop.</h1>
          <p>Generation can run synchronously for the MVP, but the receipt still keeps the job trail.</p>
          <div className="status-list">
            {stages.map((stage) => (
              <div className="status-item" key={stage}>
                <span>{stage}</span>
                <strong>{job.status === "failed" ? "stopped" : "done"}</strong>
              </div>
            ))}
          </div>
          {job.error ? <p className="error">{job.error}</p> : null}
          {drop ? (
            <Link className="btn accent" href={`/d/${drop.slug}`}>
              open storefront
            </Link>
          ) : (
            <Link className="btn secondary" href="/">
              try another link
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
