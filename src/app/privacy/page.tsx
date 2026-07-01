import Link from "next/link";

export const metadata = {
  title: "DropLink Privacy Policy",
  description: "Privacy Policy for DropLink by Anky, Inc."
};

export default function PrivacyPage() {
  return (
    <main className="about-page">
      <section className="about-shell legal-shell">
        <Link className="about-agent-link" href="/">
          back to droplink
        </Link>
        <h1>Privacy Policy</h1>
        <p className="muted">Effective June 30, 2026</p>

        <h2>Operator</h2>
        <p>
          DropLink is operated by Anky, Inc. This policy explains how we collect, use, share, and retain information
          when you use droplink.lat and related DropLink services.
        </p>

        <h2>Information We Collect</h2>
        <p>
          When you log in with X, we collect the account information X returns to us, which may include your X user id,
          username, display name, profile image, and authentication tokens needed to complete login. We use this
          information to create your DropLink account, attribute scouts, show your public scout profile, and keep you
          signed in.
        </p>
        <p>
          When you scout or interact with a DropLink, we collect submitted URLs, canonical domains, generated drop
          records, source signals, payment references, scout attribution, claim status, and event logs needed to operate
          the service. If you claim a domain, we may collect DNS verification records and payout setup details. If you
          buy a product or request a notification, we may collect checkout, shipping, order, and email notification
          information through our payment and fulfillment providers.
        </p>

        <h2>Public Information</h2>
        <p>
          Scout profiles are public. Your public profile may show your X username, display name, profile image, total
          scouts, all-time scout earnings, and the DropLinks you have scouted. Scouted DropLinks may also show
          "Scouted by @username" and link to your public profile.
        </p>

        <h2>How We Use Information</h2>
        <p>
          We use information to authenticate users, prevent duplicate scouting, process x402 or Stripe payments,
          generate DropLink previews, verify DNS claims, attribute scout revenue, operate checkout and fulfillment,
          detect abuse, debug failures, improve the service, and comply with legal obligations.
        </p>

        <h2>Service Providers</h2>
        <p>
          DropLink may share information with service providers that help operate the service, including X for login,
          Stripe for payments, Printful for fulfillment, Cloudflare for hosting and tunneling, database and storage
          providers, email providers, blockchain or x402 payment infrastructure, and AI or image-generation providers
          used to generate DropLink previews.
        </p>

        <h2>Cookies and Sessions</h2>
        <p>
          DropLink uses cookies to manage login sessions and OAuth state. These cookies help keep you signed in and
          protect the login flow. You can clear cookies in your browser, but parts of the service that require login may
          stop working until you sign in again.
        </p>

        <h2>Retention</h2>
        <p>
          We keep account, scout, payment, order, claim, and operational records for as long as needed to provide the
          service, maintain attribution, resolve disputes, satisfy accounting or legal requirements, prevent abuse, and
          preserve the integrity of public DropLink pages.
        </p>

        <h2>Your Choices</h2>
        <p>
          You can log out at any time. You may contact us to request access, correction, or deletion of personal
          information. Some information may need to be retained where required for legal, payment, security, dispute,
          accounting, or fraud-prevention reasons.
        </p>

        <h2>Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect information. No internet service can be
          guaranteed to be completely secure, and you are responsible for keeping access to your X account and devices
          secure.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy as DropLink changes. The effective date above will be updated when we make material
          changes.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy may be directed to{" "}
          <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">
            @jpfraneto
          </a>
          . Please also review the <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </main>
  );
}
