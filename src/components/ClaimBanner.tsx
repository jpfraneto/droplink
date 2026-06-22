import type { Drop } from "@/lib/types";

export function ClaimBanner({ drop }: { drop: Drop }) {
  return (
    <section className="section">
      <div className="receipt" style={{ gridTemplateColumns: "1.4fr .6fr", alignItems: "center" }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: 8 }}>
            Own this project?
          </h2>
          <p className="muted">
            Claim this drop and connect Stripe to sell from your own account. DropLink records an 8% platform fee.
          </p>
        </div>
        <button className="btn secondary" type="button">
          connect Stripe
        </button>
      </div>
    </section>
  );
}
