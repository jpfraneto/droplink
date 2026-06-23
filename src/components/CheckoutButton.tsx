"use client";

import { useState } from "react";

export function CheckoutButton({
  relicId,
  label = "BUY NOW",
  className = "btn accent"
}: {
  relicId: string;
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relicId })
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button className={className} type="button" onClick={checkout} disabled={loading}>
        {loading ? "STARTING..." : label}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
