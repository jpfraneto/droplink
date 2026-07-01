import type { Mockup, Relic, RelicEdition } from "@/lib/types";
import { formatMoney } from "@/lib/productCatalog";
import { inferUniversalSlot } from "@/lib/productValidation";
import { CheckoutButton } from "./CheckoutButton";

export function ProductCard({
  dropId,
  relic,
  editions,
  mockup
}: {
  dropId?: string | null;
  relic: Relic;
  editions: RelicEdition[];
  mockup?: Mockup;
}) {
  const claimed = editions.filter((edition) => edition.status === "sold").length;
  const left = Math.max(0, relic.totalSupply - claimed);
  const soldOut = left === 0 || relic.status === "sold_out";
  const slot = inferUniversalSlot({
    universalSlot: relic.fulfillmentSpecJson?.universalSlot,
    productFamily: relic.productFamily,
    productName: relic.fulfillmentSpecJson?.productName,
    productType: relic.fulfillmentSpecJson?.productType,
    productCategory: relic.fulfillmentSpecJson?.productCategory
  });

  return (
    <article className="card">
      {mockup?.imageUrl ? <img className="product-image" src={mockup.imageUrl} alt={relic.name} /> : null}
      <div className="card-body">
        <p className="pill" style={{ margin: "0 0 12px" }}>
          {slot || "finite"} object
        </p>
        <h3 className="product-title">{relic.name}</h3>
        <p className="muted">{relic.description}</p>
        <p className="muted">
          {claimed} / {relic.totalSupply} claimed · {left} left
        </p>
        <p className="price">{formatMoney(relic.priceCents, relic.currency)}</p>
        {soldOut ? <button className="btn secondary" disabled>SOLD OUT</button> : <CheckoutButton dropId={dropId} relicId={relic.id} label="BUY NOW" className="btn secondary" />}
      </div>
    </article>
  );
}
