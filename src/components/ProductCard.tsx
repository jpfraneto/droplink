import type { Mockup, Relic, RelicEdition } from "@/lib/types";
import { formatMoney } from "@/lib/productCatalog";
import { CheckoutButton } from "./CheckoutButton";

export function ProductCard({
  relic,
  editions,
  mockup
}: {
  relic: Relic;
  editions: RelicEdition[];
  mockup?: Mockup;
}) {
  const claimed = editions.filter((edition) => edition.status === "sold").length;
  const left = Math.max(0, relic.totalSupply - claimed);
  const soldOut = left === 0 || relic.status === "sold_out";

  return (
    <article className="card">
      <img className="product-image" src={mockup?.imageUrl || `/api/mockups/${relic.id}.svg`} alt={relic.name} />
      <div className="card-body">
        <p className="pill" style={{ margin: "0 0 12px" }}>
          limited product
        </p>
        <h3 className="product-title">{relic.name}</h3>
        <p className="muted">{relic.description}</p>
        <p className="muted">
          {claimed} / {relic.totalSupply} claimed · {left} left
        </p>
        <p className="price">{formatMoney(relic.priceCents, relic.currency)}</p>
        {soldOut ? <button className="btn secondary" disabled>SOLD OUT</button> : <CheckoutButton relicId={relic.id} label="BUY NOW" className="btn secondary" />}
      </div>
    </article>
  );
}
