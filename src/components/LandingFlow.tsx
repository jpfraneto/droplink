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

function validUrl(value: string) {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function LandingFlow() {
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
          <a className="mobile-directory-link" href="/directory">
            Directory
          </a>
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
              {loading ? "Reading the link" : "Summon the drop"}
            </button>
          </form>
          {error ? <p className="landing-error">{error}</p> : null}
        </section>

        <section className="landing-preview" aria-label="Example droplink preview">
          <div className="landing-domain-divider">
            <span />
            <strong>amazon.com</strong>
            <span />
          </div>
          <div className="landing-elements">
            <article>
              <h2>Wear</h2>
              <div>
                <img src="/landing/amazon-wear.png" alt="Amazon sweatshirt example" />
              </div>
            </article>
            <article>
              <h2>Display</h2>
              <div>
                <img src="/landing/amazon-display.png" alt="Amazon framed print example" />
              </div>
            </article>
            <article>
              <h2>Use</h2>
              <div>
                <img src="/landing/amazon-use.png" alt="Prime mug example" />
              </div>
            </article>
          </div>
        </section>
      </div>
      <footer className="landing-footer">
        <a href="/terms">terms and conditions</a>
        <a href="/about">about</a>
        <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">
          by @jpfraneto
        </a>
      </footer>
    </main>
  );
}
