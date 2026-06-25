import Link from "next/link";

export const metadata = {
  title: "About DropLink",
  description: "DropLink turns a root domain into one finite merch market."
};

export default function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-shell">
        <a className="about-agent-link" href="/about.md">
          if you are an agent read here /about.md
        </a>
        <h1>DropLink turns a root domain into one finite merch market.</h1>
        <p>
          Paste a link. DropLink resolves the root domain, generates three merch relics, and mints eight editions of
          each. That is the whole market: 24 physical objects. When they sell out, the drop is complete forever.
        </p>
        <p>
          Anyone can summon a domain. The summoner pays 8 USDC to process it and becomes the discoverer. If the verified
          domain owner later claims the DropLink with DNS, the summoner earns 8% of the net revenue from sales.
        </p>
        <p>
          DNS is ownership. Payout is a setting. The domain owner claims with a TXT record, then chooses Tempo USDC or
          Stripe Connect for payouts. Unclaimed drops can be seen, but they cannot sell.
        </p>
        <p>
          Stripe handles checkout. Printful makes the object. DropLink records the economics: projected before the first
          sale, settled after each paid order.
        </p>
        <p>
          <Link href="/">back to droplink</Link>
        </p>
      </section>
    </main>
  );
}
