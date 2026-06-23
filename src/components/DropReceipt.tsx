import type { StorefrontBundle } from "@/lib/types";

export function DropReceipt({ bundle }: { bundle: StorefrontBundle }) {
  return (
    <section className="section">
      <h2 className="section-title">Storefront Receipt</h2>
      <div className="receipt">
        <div>
          <h3>Brand</h3>
          <p>{bundle.brand.name}</p>
        </div>
        <div>
          <h3>Source</h3>
          <p>{bundle.brand.canonicalUrl}</p>
        </div>
        <div>
          <h3>Collection</h3>
          <p>{bundle.activeCollection?.title}</p>
        </div>
        <div>
          <h3>Scarcity</h3>
          <p>{bundle.relics.length} products, 8 units each.</p>
        </div>
      </div>
    </section>
  );
}
