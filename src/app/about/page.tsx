import Link from "next/link";

export const metadata = {
  title: "About DropLink",
  description: "Anyone can scout a DropLink. Only owners can sell."
};

export default function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-shell">
        <a className="about-agent-link" href="/about.md">
          if you are an agent read here /about.md
        </a>
        <h1>Anyone can scout. Only owners can sell.</h1>
        <p>
          DropLink lets anyone scout a merch drop for a brand on the internet.
        </p>
        <p>
          A scouted DropLink is only a preview. The real domain owner must claim it before anything can be sold.
        </p>
        <p>
          Every live DropLink has 3 products: Wear, Display, Use. Each has 8 units.
        </p>
        <p>
          Scouts pay 8 USDC through x402 to create a preview. If the verified owner later claims and activates the
          DropLink, a third-party scout can receive 8% of future revenue. The owner receives 92%. If the owner scouted
          and claimed their own DropLink, the owner receives 100%.
        </p>
        <p>
          DropLink is a hackathon project by <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">@jpfraneto</a>.
        </p>
        <p>
          <Link href="/">back to droplink</Link>
        </p>
      </section>
    </main>
  );
}
