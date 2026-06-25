import Link from "next/link";
import { cookies } from "next/headers";
import { listStorefrontBundles } from "@/lib/store";

export const dynamic = "force-dynamic";

function hasAdminCookie() {
  if (process.env.DROPLINK_REQUIRE_GENERATION_KEY !== "true") return true;
  const expected = process.env.DROPLINK_API_KEY;
  return Boolean(expected && cookies().get("droplink_admin")?.value === expected);
}

export default async function AdminPage({ searchParams }: { searchParams: { error?: string; auth?: string } }) {
  if (!hasAdminCookie()) {
    return (
      <main>
        <div className="shell admin-shell">
          <h1>DropLink admin</h1>
          <form className="admin-form" action="/api/admin/login" method="post">
            <label>
              Admin key
              <input name="key" type="password" autoComplete="current-password" />
            </label>
            <button className="btn accent" type="submit">
              enter
            </button>
          </form>
          {searchParams.auth ? <p className="error">Invalid admin key.</p> : null}
        </div>
      </main>
    );
  }

  const bundles = await listStorefrontBundles();

  return (
    <main>
      <div className="shell admin-shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink admin
          </Link>
          <span className="badge">guided workflow</span>
        </header>

        {searchParams.error ? <p className="error">{searchParams.error}</p> : null}

        <section className="workflow-action">
          <span>New DropLink</span>
          <h1>Submit a brand URL</h1>
          <p>After submitting, you will land on that brand's workflow page with the live pipeline, required uploads, readiness, and publish action.</p>
          <form className="admin-form" action="/api/admin/generate" method="post">
            <label>
              Public URL
              <input name="url" placeholder="https://nousresearch.com" required />
            </label>
            <button className="btn accent" type="submit">
              start generation
            </button>
          </form>
        </section>

        <section className="admin-panel">
          <div className="admin-actions">
            <div>
              <h2>Existing workflows</h2>
              <p className="muted">Open a brand to see what happened, what is blocked, and what to do next.</p>
            </div>
          </div>
          <div className="admin-list">
            {bundles.map((bundle) => {
              const sold = bundle.editions.filter((edition) => edition.status === "sold").length;
              return (
                <Link className="admin-row" key={bundle.storefront.id} href={`/admin/${bundle.storefront.slug}`}>
                  <strong>{bundle.brand.name}</strong>
                  <span>/{bundle.storefront.slug}</span>
                  <small>
                    {bundle.drop?.status || bundle.storefront.status} · {bundle.storefront.generationStatus} · {sold}/24 sold
                  </small>
                </Link>
              );
            })}
            {!bundles.length ? <p className="muted">No DropLinks have been generated yet.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
