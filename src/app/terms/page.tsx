import Link from "next/link";

export const metadata = {
  title: "DropLink Terms and Conditions",
  description: "Terms and conditions for DropLink by Anky, Inc."
};

export default function TermsPage() {
  return (
    <main className="about-page">
      <section className="about-shell legal-shell">
        <Link className="about-agent-link" href="/">
          back to droplink
        </Link>
        <h1>Terms and Conditions</h1>
        <p className="muted">Effective June 29, 2026</p>

        <h2>Operator</h2>
        <p>
          DropLink is operated by Anky, Inc. These terms govern access to the DropLink website, droplink.lat, and any
          related services for generating, claiming, previewing, buying, and fulfilling limited physical merchandise
          drops connected to internet domains.
        </p>

        <h2>What DropLink Does</h2>
        <p>
          DropLink lets a user submit a public URL. The service resolves the root domain, reads public metadata and
          public page content, and uses automated systems to generate a proposed limited merchandise drop. A drop is
          intended to contain three physical product concepts with eight units each.
        </p>
        <p>
          A scouted DropLink is a preview only. It is not an official or authorized merchandise store for a brand unless
          and until the verified owner of the relevant domain completes the domain claim process and activates commerce.
        </p>

        <h2>Scouting and x402 Payments</h2>
        <p>
          If a DropLink does not exist for a canonical domain, a user may pay 8 USDC through x402 to scout it. This
          payment covers computation, product design, and creation of the DropLink preview. Scouting does not transfer
          ownership of the submitted domain, the brand, or any third-party intellectual property. Scouting does not
          authorize sales.
        </p>
        <p>
          A third-party scout may be eligible to receive 8% of future revenue from a generated DropLink if the verified
          domain owner later claims and activates the drop. If the owner claims a DropLink scouted by someone else, 92%
          of revenue is allocated to the owner and 8% to the scout. If the owner scouted and claimed their own DropLink,
          the owner receives 100% and no scout cut applies. Eligibility, payout timing, and payout availability depend on
          successful domain verification, completed sales, payment processor availability, fraud checks, refunds,
          chargebacks, fulfillment costs, taxes, and applicable law.
        </p>

        <h2>Domain Ownership and Activation</h2>
        <p>
          Domain ownership is verified through DNS. A domain owner must publish the requested TXT record and complete the
          claim flow before a droplink can become active for commerce. Unclaimed droplinks are previews only and products
          cannot be purchased from them.
        </p>
        <p>
          Only verified domain owners can activate commerce. DropLink may remove, disable, reject, or refuse to publish
          any DropLink that appears infringing, abusive, misleading, unlawful, or likely to confuse users about brand
          authorization.
        </p>

        <h2>Purchases and Fulfillment</h2>
        <p>
          When a droplink is active, checkout may be processed by Stripe or another payment provider. Physical products
          may be produced and shipped by third-party fulfillment providers such as Printful. Product availability is
          limited, and a sold-out item may not be restocked.
        </p>

        <h2>Refund Policy</h2>
        <p>
          Scouting payments are generally non-refundable once generation begins because computation and design work start
          immediately. Anky, Inc may issue a refund for a scouting payment at its discretion if the charge was duplicated,
          unauthorized, or if the service failed before meaningful generation work began.
        </p>
        <p>
          Physical product orders are made to order. Refunds or replacements for physical goods may be available for
          damaged items, manufacturing defects, incorrect items, or orders that cannot be fulfilled. Buyer remorse,
          incorrect size selection, incorrect shipping information, or ordinary delays outside our control may not
          qualify for a refund. Requests should be made promptly with the order details and supporting photos when
          relevant.
        </p>

        <h2>Intellectual Property</h2>
        <p>
          Submitted URLs, brand names, logos, and trademarks may belong to third parties. DropLink does not grant a user
          rights in any third-party intellectual property. Domain owners are responsible for ensuring that activated
          drops are lawful and authorized. Anky, Inc may remove, disable, or refuse any droplink that appears infringing,
          misleading, abusive, or unlawful.
        </p>

        <h2>No Guarantees</h2>
        <p>
          DropLink is experimental software. Generated product concepts, images, pricing, availability, payouts, and
          fulfillment timelines may change. The service is provided as is, without warranties of uninterrupted operation,
          commercial performance, or fitness for a particular purpose.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Anky, Inc is not liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits, lost revenue, lost data, brand harm, or
          business interruption arising from use of DropLink.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about DropLink may be directed to <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">@jpfraneto</a>.
        </p>
      </section>
    </main>
  );
}
