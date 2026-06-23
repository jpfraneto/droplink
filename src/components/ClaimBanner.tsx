import type { StorefrontBundle } from "@/lib/types";

export function ClaimBanner({ bundle }: { bundle: StorefrontBundle }) {
  if (bundle.storefront.claimStatus === "verified") return null;
  return (
    <section className="claim-strip">
      <div>
        <strong>Own this brand?</strong>
        <span>Claim the storefront with a DNS TXT record.</span>
      </div>
      <form action="/api/claims/start" method="post">
        <input type="hidden" name="storefrontId" value={bundle.storefront.id} />
        <button className="btn secondary" type="submit">
          start claim
        </button>
      </form>
    </section>
  );
}
