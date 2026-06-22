import type { Drop, Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ drop, products }: { drop: Drop; products: Product[] }) {
  return (
    <div className="grid">
      {products.map((product) => (
        <ProductCard key={product.id} drop={drop} product={product} />
      ))}
    </div>
  );
}
