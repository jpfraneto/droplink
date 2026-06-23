import type { StorefrontBundle } from "@/lib/types";

export function ShareCardPreview({ bundle }: { bundle: StorefrontBundle }) {
  if (!bundle.ogImage) return null;
  return (
    <div className="share-card">
      <img src={bundle.ogImage.imageUrl} alt={`${bundle.activeCollection?.title || bundle.brand.name} share image`} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
