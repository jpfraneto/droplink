"use client";

import { useState } from "react";

export function DropProductCard({
  relicId,
  imageUrl,
  title,
  description,
  printfulName,
  printfulUrl,
  price,
  unitsLeft,
  commerceOpen
}: {
  relicId: string;
  imageUrl: string;
  title: string;
  description: string;
  printfulName: string;
  printfulUrl: string;
  price: string;
  unitsLeft: number;
  commerceOpen: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canBuy = commerceOpen && unitsLeft > 0;

  async function checkout() {
    if (!canBuy || loading) return;
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
    <article className={`simple-product${canBuy ? " can-buy" : ""}${loading ? " is-loading" : ""}`}>
      <div className="simple-product-image">
        {imageUrl ? <img src={imageUrl} alt={title} /> : null}
      </div>
      <div className="simple-product-copy">
        <h2>{title}</h2>
        <p>{description}</p>
        <a href={printfulUrl} target="_blank" rel="noreferrer">
          {printfulName}
        </a>
        <div>
          <span>{price}</span>
          <span>{unitsLeft} left</span>
        </div>
        <button type="button" disabled={!canBuy || loading} onClick={checkout}>
          BUY
        </button>
        {error ? <small>{error}</small> : null}
      </div>
    </article>
  );
}
