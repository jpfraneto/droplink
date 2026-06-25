import Link from "next/link";
import { cookies } from "next/headers";
import { AdminDropWorkflow } from "@/components/AdminDropWorkflow";
import { getStorefrontBundleBySlug } from "@/lib/store";

export const dynamic = "force-dynamic";

function hasAdminCookie() {
  if (process.env.DROPLINK_REQUIRE_GENERATION_KEY !== "true") return true;
  const expected = process.env.DROPLINK_API_KEY;
  return Boolean(expected && cookies().get("droplink_admin")?.value === expected);
}

export default async function AdminBrandPage({
  params,
  searchParams
}: {
  params: { brandSlug: string };
  searchParams: { job?: string; auth?: string; error?: string };
}) {
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

  const bundle = await getStorefrontBundleBySlug(params.brandSlug);

  return (
    <main>
      <div className="shell admin-shell">
        <header className="topbar">
          <Link className="brand" href="/admin">
            DropLink admin
          </Link>
          <div className="admin-nav-actions">
            <Link className="btn secondary" href="/admin">
              all drops
            </Link>
            {bundle ? (
              <Link className="btn secondary" href={`/${bundle.storefront.slug}`}>
                public page
              </Link>
            ) : null}
          </div>
        </header>
        {searchParams.error ? <p className="error">{searchParams.error}</p> : null}
        <AdminDropWorkflow brandSlug={params.brandSlug} storefrontId={bundle?.storefront.id || null} jobId={searchParams.job || null} />
      </div>
    </main>
  );
}
