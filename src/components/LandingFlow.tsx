"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LookupPayload = {
  slug: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  favicon?: string | null;
  error?: string;
};

type LandingUser = {
  username: string;
  avatarUrl: string | null;
} | null;

function validUrl(value: string) {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function LandingFlow({ user }: { user: LandingUser }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => validUrl(url), [url]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/droplinks/lookup?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const data = (await response.json()) as LookupPayload;
      if (!response.ok) throw new Error(data.error || "Could not read this URL.");
      const params = new URLSearchParams({
        url: data.url,
        domain: data.domain,
        title: data.title,
        description: data.description
      });
      if (data.favicon) params.set("favicon", data.favicon);
      router.push(`/${data.slug}?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this URL.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="drop-landing">
      <div className="phone-screen landing-screen">
        <header className="mobile-nav">
          <strong>DropLink</strong>
          <nav className="mobile-nav-actions" aria-label="Primary">
            <a className="mobile-directory-link" href="/directory">
              Directory
            </a>
            {user ? (
              <a className="avatar-action" href={`/u/${user.username}`} aria-label={`Open @${user.username} profile`}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span aria-hidden="true" />}
              </a>
            ) : (
              <a className="avatar-action" href="/api/auth/x/login?returnTo=/" aria-label="Login with X">
                <span aria-hidden="true" />
              </a>
            )}
          </nav>
        </header>

        <section className="landing-hero" aria-label="Summon a droplink">
          <h1>Every link has a drop inside it.</h1>
          <p>Distill the essence of any brand on the internet into a limited merch collection. 3 elements with 8 units each.</p>
          <form className="summon-panel" onSubmit={submit}>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste a link"
              aria-label="URL to distill"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button type="submit" disabled={!canSubmit || loading}>
              {loading ? "Reading the link" : `Scout  ${url}`}
            </button>
          </form>
          {error ? <p className="landing-error">{error}</p> : null}
        </section>

        <section className="landing-preview" aria-label="Example droplink preview">
          <div className="landing-domain-divider">
            <span />
            <strong>nousresearch.com</strong>
            <span />
          </div>
          <div className="landing-elements">
            <a href="/nousresearchcom?item=wear" aria-label="Open Hermes Operator Crewneck details">
              <article>
                <h2>Wear</h2>
                <div>
                  <img src="https://assets.droplink.lat/collections/col_dd8422937585060cf8/relics/relic_91571cf4b68aee4e18/mockup-wear.png" alt="Nous Research crewneck example" />
                </div>
              </article>
            </a>
            <a href="/nousresearchcom?item=display" aria-label="Open Nous Commons Model Card details">
              <article>
                <h2>Display</h2>
                <div>
                  <img src="https://assets.droplink.lat/collections/col_dd8422937585060cf8/relics/relic_5f6948fea4bb2172e3/mockup-display.png" alt="Nous Research model card example" />
                </div>
              </article>
            </a>
            <a href="/nousresearchcom?item=use" aria-label="Open Atropos Trajectory Journal details">
              <article>
                <h2>Use</h2>
                <div>
                  <img src="https://assets.droplink.lat/collections/col_dd8422937585060cf8/relics/relic_9ae47e46838060d272/mockup-use.png" alt="Nous Research journal example" />
                </div>
              </article>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
