import Link from "next/link";
import { notFound } from "next/navigation";
import { getGenerationJob, getStorefrontBundleById } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: { jobId: string } }) {
  const job = await getGenerationJob(params.jobId);
  if (!job) notFound();
  const bundle = job.storefrontId ? await getStorefrontBundleById(job.storefrontId) : null;

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
          <h1>{job.currentStep}</h1>
          <p>Generation status is persisted. Use admin review for logs, checklist, relic plan, and publishing.</p>
          {job.error ? <p className="error">{job.error}</p> : null}
          {bundle ? (
            <Link className="btn accent" href={`/admin?storefront=${bundle.storefront.id}`}>
              open admin review
            </Link>
          ) : (
            <Link className="btn secondary" href="/admin">
              open admin
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
