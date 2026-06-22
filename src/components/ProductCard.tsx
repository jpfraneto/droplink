import type { Drop, Product } from "@/lib/types";
import { formatMoney } from "@/lib/productCatalog";
import { CheckoutButton } from "./CheckoutButton";

export function ProductCard({ drop, product }: { drop: Drop; product: Product }) {
  return (
    <article className="card">
      <img className="product-image" src={product.imageUrl || product.mockupUrl} alt={product.name} />
      <div className="card-body">
        <p className="pill" style={{ margin: "0 0 12px" }}>
          {product.type}
        </p>
        <h3 className="product-title">{product.name}</h3>
        <p className="muted">{product.description}</p>
        <p className="price">{formatMoney(product.priceCents, product.currency)}</p>
        <CheckoutButton dropId={drop.id} productId={product.id} label="BUY" className="btn secondary" />
      </div>
    </article>
  );
}
