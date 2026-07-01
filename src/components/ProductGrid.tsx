import type { Mockup, Relic, RelicEdition } from "@/lib/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  dropId,
  relics,
  editions,
  mockups
}: {
  dropId?: string | null;
  relics: Relic[];
  editions: RelicEdition[];
  mockups: Mockup[];
}) {
  return (
    <div className="grid">
      {relics.map((relic) => (
        <ProductCard
          key={relic.id}
          dropId={dropId}
          relic={relic}
          editions={editions.filter((edition) => edition.relicId === relic.id)}
          mockup={mockups.find((entry) => entry.relicId === relic.id)}
        />
      ))}
    </div>
  );
}
