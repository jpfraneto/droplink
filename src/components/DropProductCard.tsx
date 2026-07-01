"use client";

import { useState } from "react";

export function DropProductCard({
  dropId,
  relicId,
  checkoutUrl,
  imageUrl,
  kindLabel,
  title,
  description,
  price,
  remaining,
  total = 8,
  commerceEnabled = true,
  onPreviewClick,
  onDetailsClick
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
  onDetailsClick?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soldOut = remaining <= 0;
  const canBuy = commerceEnabled && !soldOut && Boolean(checkoutUrl || (dropId && relicId));

  async function checkout() {
    if (!canBuy || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      if (!dropId || !relicId) throw new Error("Checkout is unavailable for this product.");
      const response = await fetch(`/api/droplinks/${dropId}/checkout`, {
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
    <article
      className={`simple-product${canBuy ? " can-buy" : ""}${loading ? " is-loading" : ""}${onDetailsClick ? " has-details" : ""}`}
      onClick={onDetailsClick}
    >
      <div className="simple-product-copy">
        {kindLabel ? <span className="simple-product-kind">{kindLabel}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="simple-product-bottom">
          <div className="simple-product-meta">
            <span>{remaining}/{total} left</span>
            {commerceEnabled ? (
              <button
                type="button"
                disabled={!canBuy || loading}
                onClick={(event) => {
                  event.stopPropagation();
                  checkout();
                }}
                aria-label={soldOut ? `${title} is sold out` : `Buy ${title} for ${price}`}
              >
                {soldOut ? "SOLD OUT" : loading ? "RESERVING..." : `BUY ${price}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreviewClick?.();
                }}
                aria-label={`Get notified when ${title} goes live`}
              >
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
