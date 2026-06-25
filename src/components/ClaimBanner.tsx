import type { StorefrontBundle } from "@/lib/types";

export function ClaimBanner({ bundle }: { bundle: StorefrontBundle }) {
  if (bundle.storefront.claimStatus === "verified") return null;
  if (bundle.drop?.status === "published" || bundle.drop?.status === "sold_out" || bundle.drop?.status === "archived") return null;
  return (
    <section className="claim-strip">
      <div>
        <strong>Control this domain?</strong>
        <span>Claim {bundle.drop?.canonicalRootDomain || bundle.drop?.canonicalDomain || bundle.brand.hostname} with DNS. Choose payout later.</span>
      </div>
      <form action="/api/claims/start" method="post">
        <input type="hidden" name="storefrontId" value={bundle.storefront.id} />
        <input name="claimantEmail" placeholder="owner email" />
        <button className="btn secondary" type="submit">
          start claim
        </button>
      </form>
    </section>
  );
}
