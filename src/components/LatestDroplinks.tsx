"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LatestDroplink = {
  id: string;
  slug: string;
  brandName: string;
  hostname: string;
  imageUrl: string;
  title: string;
  products: string[];
  sold: number;
  total: number;
};

export function LatestDroplinks({ initial }: { initial: LatestDroplink[] }) {
  const [items, setItems] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/storefronts/latest", { cache: "no-store" });
      const data = (await response.json()) as { storefronts: LatestDroplink[] };
      if (response.ok) {
        setItems(data.storefronts);
        setUpdatedAt(new Date());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = window.setInterval(refresh, 10000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="section">
      <div className="feed-head">
        <div>
          <h2 className="section-title">Latest droplinks</h2>
          <p className="muted">
            <span className="live-dot" /> Live feed{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}
          </p>
        </div>
        <button className="btn secondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? "refreshing..." : "refresh"}
        </button>
      </div>
      <div className="latest-list">
        {items.length ? (
          items.map((item) => (
            <Link className="latest-row" key={item.id} href={`/${item.slug}`}>
              <img className="latest-image" src={item.imageUrl} alt={`${item.brandName} drop summary`} />
              <div className="latest-meta">
                <strong>{item.brandName}</strong>
                <span>{item.hostname}</span>
                <small>{item.products.join(" | ")}</small>
                <small>
                  {item.sold} / {item.total} sold
                </small>
              </div>
            </Link>
          ))
        ) : (
          <div className="latest-empty">
            <strong>No droplinks yet.</strong>
            <span>Generate and publish the first one from admin.</span>
          </div>
        )}
      </div>
    </section>
  );
}
