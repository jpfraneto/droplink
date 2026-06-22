import type { Drop } from "@/lib/types";

export function ShareCardPreview({ drop }: { drop: Drop }) {
  return (
    <div className="share-card">
      <img src={drop.ogImageUrl} alt={`${drop.collectionName} share image`} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
