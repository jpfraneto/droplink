"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const examples = [
  "https://nousresearch.com",
  "https://stripe.com",
  "https://nvidia.com",
  "https://anky.app",
  "https://yourstartup.com"
];

export function UrlInput() {
  const router = useRouter();
  const [url, setUrl] = useState("https://nousresearch.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/droplinks/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submittedUrl: url })
      });
      const data = (await response.json()) as { jobId?: string; slug?: string; error?: string };
      if (!response.ok || !data.slug) {
        throw new Error(
          response.status === 401
            ? "Scout mode currently requires admin access until public payments are enabled."
            : data.error || "Could not scout this brand."
        );
      }
      router.push(`/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scout this brand.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form className="url-form" onSubmit={submit}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://yourstartup.com"
          aria-label="Public URL"
        />
        <button className="btn accent" type="submit" disabled={loading}>
          {loading ? "scouting..." : "scout brand"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <div className="examples" style={{ marginTop: 18 }}>
        {examples.map((example) => (
          <button className="pill" key={example} type="button" onClick={() => setUrl(example)}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
