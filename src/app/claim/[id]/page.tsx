import Link from "next/link";
import { notFound } from "next/navigation";
import { getClaim } from "@/lib/store";

export const dynamic = "force-dynamic";

function statusMessage(status?: string, message?: string) {
  if (status === "verified") return { kind: "success", text: "DNS verified. This storefront is now claimed." };
  if (status === "missing") return { kind: "warn", text: "DNS record not found yet. Add the TXT record below, then wait a few minutes and check again." };
  if (status === "rate_limited") return { kind: "warn", text: "Too many checks. Wait a minute and try again." };
  if (status === "error") return { kind: "warn", text: message ? `DNS check failed: ${message}` : "DNS check failed. Try again in a few minutes." };
  if (status === "not_found") return { kind: "warn", text: "Claim not found." };
  return null;
}

export default async function ClaimPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { status?: string; message?: string };
}) {
  const claim = await getClaim(params.id);
  if (!claim) notFound();
  const notice = statusMessage(searchParams.status, searchParams.message);
  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink
          </Link>
          <span className="badge">{claim.status}</span>
        </header>
        <section className="admin-panel">
          <h1>Claim storefront</h1>
          <p className="muted">Add this DNS TXT record, then check verification.</p>
          {notice ? (
            <div className={notice.kind === "success" ? "success-note" : "warning-note"}>
              {notice.text}
            </div>
          ) : null}
          <div className="receipt">
            <div>
              <h3>TXT name</h3>
              <p>{claim.txtName}</p>
            </div>
            <div>
              <h3>TXT value</h3>
              <p>{claim.txtValue}</p>
            </div>
          </div>
          <form action={`/api/claims/${claim.id}/check`} method="post" style={{ marginTop: 16 }}>
            <button className="btn accent" type="submit">
              check DNS
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
