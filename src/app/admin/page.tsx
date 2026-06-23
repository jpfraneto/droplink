import Link from "next/link";
import { cookies } from "next/headers";
import { formatMoney } from "@/lib/productCatalog";
import { getStorefrontBundleById, listStorefrontBundles, reviewReadiness } from "@/lib/store";

export const dynamic = "force-dynamic";

function hasAdminCookie() {
  if (process.env.DROPLINK_REQUIRE_GENERATION_KEY !== "true") return true;
  const expected = process.env.DROPLINK_API_KEY;
  return Boolean(expected && cookies().get("droplink_admin")?.value === expected);
}

export default async function AdminPage({ searchParams }: { searchParams: { storefront?: string; error?: string; auth?: string } }) {
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
  const selected = searchParams.storefront
    ? await getStorefrontBundleById(searchParams.storefront)
    : bundles[0] || null;
  const readiness = selected ? reviewReadiness(selected) : null;

  return (
    <main>
      <div className="shell admin-shell">
        <header className="topbar">
          <Link className="brand" href="/">
            DropLink admin
          </Link>
          <span className="badge">manual launch workflow</span>
        </header>
        {searchParams.error ? <p className="error">{searchParams.error}</p> : null}
        <section className="admin-panel">
          <h1>Submit selected brand URL</h1>
          <form className="admin-form" action="/api/admin/generate" method="post">
            <label>
              Public URL
              <input name="url" placeholder="https://nousresearch.com" required />
            </label>
            <label>
              Tier
              <select name="tier" defaultValue="free">
                <option value="free">Free / Genesis</option>
                <option value="atelier">Premium / Atelier</option>
              </select>
            </label>
            <label>
              Collection type
              <select name="type" defaultValue="genesis">
                <option value="genesis">Genesis · 3 relics</option>
                <option value="weekly">Weekly · 8 relics</option>
              </select>
            </label>
            <button className="btn accent" type="submit">
              generate
            </button>
          </form>
        </section>

        <section className="admin-grid">
          <div className="admin-panel">
            <h2>Storefronts</h2>
            <div className="admin-list">
              {bundles.map((bundle) => (
                <Link className="admin-row" key={bundle.storefront.id} href={`/admin?storefront=${bundle.storefront.id}`}>
                  <strong>{bundle.brand.name}</strong>
                  <span>/{bundle.storefront.slug}</span>
                  <small>
                    {bundle.storefront.status} · {bundle.storefront.generationStatus} · {bundle.storefront.tier}
                  </small>
                </Link>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="admin-panel">
              <div className="admin-actions">
                <div>
                  <h2>{selected.brand.name}</h2>
                  <p className="muted">
                    /{selected.storefront.slug} · {selected.brand.hostname}
                  </p>
                </div>
                <Link className="btn secondary" href={`/${selected.storefront.slug}`}>
                  open
                </Link>
              </div>
              <div className="admin-actions">
                <form action={`/api/admin/storefronts/${selected.storefront.id}/publish`} method="post">
                  <button className="btn accent" type="submit">
                    publish
                  </button>
                </form>
                <form action={`/api/admin/storefronts/${selected.storefront.id}/premium`} method="post">
                  <button className="btn secondary" type="submit">
                    mark Atelier
                  </button>
                </form>
              </div>

              <h3>Readiness</h3>
              <div className="checklist">
                {readiness
                  ? Object.entries(readiness.checklist).map(([key, value]) => (
                      <div className="check-row" key={key}>
                        <span>{key}</span>
                        <strong>{value ? "ok" : "blocked"}</strong>
                      </div>
                    ))
                  : null}
              </div>

              <h3>Brand study</h3>
              <pre className="admin-pre">{JSON.stringify(selected.brandStudy?.studyJson || null, null, 2)}</pre>
              <h3>Relic plan</h3>
              <pre className="admin-pre">{JSON.stringify(selected.relicPlan?.planJson || null, null, 2)}</pre>

              <h3>Relics</h3>
              <div className="admin-list">
                {selected.relics.map((relic) => (
                  <div className="admin-row" key={relic.id}>
                    <strong>{relic.name}</strong>
                    <span>
                      {relic.productFamily} · Printful {relic.printfulProductId}/{relic.printfulVariantId}
                    </span>
                    <small>
                      {formatMoney(relic.priceCents, relic.currency)} · {relic.soldCount}/8 sold · {relic.reservedCount} reserved
                    </small>
                    {relic.fulfillmentSpecJson ? (
                      <small>
                        {relic.fulfillmentSpecJson.productName} · {relic.fulfillmentSpecJson.variantName} · {relic.fulfillmentSpecJson.placement} ·{" "}
                        {relic.fulfillmentSpecJson.technique}
                      </small>
                    ) : (
                      <small>missing fulfillment spec</small>
                    )}
                    {relic.fulfillmentSpecJson?.printFileUrl ? (
                      <a href={relic.fulfillmentSpecJson.printFileUrl} target="_blank" rel="noreferrer">
                        print file
                      </a>
                    ) : null}
                    {relic.fulfillmentSpecJson?.selectionReason ? <small>{relic.fulfillmentSpecJson.selectionReason}</small> : null}
                    {selected.mockups
                      .filter((mockup) => mockup.relicId === relic.id)
                      .map((mockup) => (
                        <small key={mockup.id}>
                          mockup {mockup.status} {mockup.printfulTaskId ? `· task ${mockup.printfulTaskId}` : ""}
                        </small>
                      ))}
                  </div>
                ))}
              </div>

              <h3>OG image</h3>
              {selected.ogImage ? <img className="admin-og" src={selected.ogImage.imageUrl} alt={selected.ogImage.title} /> : null}

              <h3>Events</h3>
              <div className="admin-list">
                {selected.events.map((event) => (
                  <div className="admin-row" key={event.id}>
                    <strong>{event.eventType}</strong>
                    <span>{event.message}</span>
                    <small>
                      {event.level} · {event.createdAt}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="admin-panel">No storefronts yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
