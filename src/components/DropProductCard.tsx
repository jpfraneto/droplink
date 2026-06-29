"use client";

import { useState } from "react";

export function DropProductCard({
  dropId,
  relicId,
  checkoutUrl,
  imageUrl,
  title,
  description,
  price,
  remaining,
  total = 8,
  commerceEnabled = true,
  onPreviewClick
}: {
  dropId?: string | null;
  relicId?: string | null;
  checkoutUrl?: string | null;
  imageUrl: string;
  kindLabel?: string;
  title: string;
  description: string;
  price: string;
  remaining: number;
  total?: number;
  commerceEnabled?: boolean;
  onPreviewClick?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soldOut = remaining <= 0;
  const canBuy = commerceEnabled && !soldOut && Boolean(checkoutUrl || relicId);

  async function checkout() {
    if (!canBuy || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      const endpoint = dropId ? `/api/droplinks/${dropId}/checkout` : "/api/stripe/checkout";
      const response = await fetch(endpoint, {
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
      <div className="simple-product-copy">
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="simple-product-bottom">
          <div className="simple-product-meta">
            <span>{remaining}/{total} left</span>
            {commerceEnabled ? (
              <button
                type="button"
                disabled={!canBuy || loading}
                onClick={checkout}
                aria-label={soldOut ? `${title} is sold out` : `Buy ${title} for ${price}`}
              >
                {soldOut ? "SOLD OUT" : loading ? "RESERVING..." : `BUY ${price}`}
              </button>
            ) : (
              <button type="button" onClick={onPreviewClick} aria-label={`Get notified when ${title} goes live`}>
                BUY {price}
              </button>
            )}
          </div>
        </div>
        {error ? <small>{error}</small> : null}
      </div>
      <div className="simple-product-image">
        {imageUrl ? <img src={imageUrl} alt={`${title} product image`} /> : <div aria-hidden="true" />}
      </div>
    </article>
  );
}
