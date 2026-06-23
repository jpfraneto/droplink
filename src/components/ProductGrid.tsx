import type { Mockup, Relic, RelicEdition } from "@/lib/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  relics,
  editions,
  mockups
}: {
  relics: Relic[];
  editions: RelicEdition[];
  mockups: Mockup[];
}) {
  return (
    <div className="grid">
      {relics.map((relic) => (
        <ProductCard
          key={relic.id}
          relic={relic}
          editions={editions.filter((edition) => edition.relicId === relic.id)}
          mockup={mockups.find((entry) => entry.relicId === relic.id)}
        />
      ))}
    </div>
  );
}
