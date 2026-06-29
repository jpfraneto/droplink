# DropLink Core

DropLink turns any public URL into a finite physical merch market for the URL's root domain.

The key idea is simple: anyone can discover and summon a DropLink for a domain, but only the domain owner can claim it. A claimed and published DropLink sells exactly 24 physical objects: 3 products, 8 editions each. When the 24 editions sell, the drop is complete.

## Current Public Flow

1. A visitor lands on `/` and pastes a URL.
2. DropLink canonicalizes the URL to the registrable root domain.
3. `/api/droplinks/lookup` checks whether the domain already has a DropLink.
4. If the domain exists, the visitor is routed to the existing brand page.
5. If it is new, the visitor sees an uncreated preview page for that domain.
6. The visitor can scout the DropLink by paying the summon fee through x402 or Stripe.
7. The generation job creates the brand study, product concepts, images, Printful references, price book, OG image, and edition records.
8. The generated brand page shows the three products plus the potential earnings split.
9. The domain owner can claim the DropLink with DNS.
10. Once readiness passes, an operator publishes it and checkout becomes available.

## Money Model

- The scout or claimer side earns 8% of revenue for discovering the domain.
- The domain owner earns 92% of revenue after claiming the domain.
- If the domain owner is also the scout, the owner can receive the full eligible split.
- The public droplink page displays potential earnings for the claimer and owner at the top-right of the page.
- Actual settlement is still gated by successful payment, fulfillment costs, readiness, and configured payout rails.

## Product Model

Each generated DropLink has:

- One canonical root domain.
- Three products: Wear, Display, and Use.
- Eight editions per product.
- Twenty-four total editions.
- A generated price book.
- Public preview imagery and an OG image.
- Edition-level checkout once published.

The product invariant is not optional. DropLink is not a cart, marketplace, subscription, or unlimited merch generator.

## Ownership And Claiming

Ownership is proven with DNS, not by being the first person to paste the URL.

- Claim record: `_droplink.<rootDomain>`
- Payout proof record: `_droplink-payout.<rootDomain>`
- A DropLink can be scouted before claim.
- A DropLink cannot sell until claim and operator publish are complete.

## Main Pages

- `/` is the mobile-first landing and URL input flow.
- `/directory` lists generated public droplinks.
- `/:brandSlug` is the public DropLink page for a brand/domain.
- `/:brandSlug/admin` is the per-drop admin page.
- `/admin` is the operator console.
- `/claim/:id` is the claim verification flow.
- `/terms` and `/about` are public legal/context pages.

## Main API Boundaries

- `/api/droplinks/lookup` resolves a pasted URL into an existing or preview DropLink route.
- `/api/droplinks/summon` starts x402-based scouting.
- `/api/droplinks/scout/stripe` starts Stripe-based scouting.
- `/api/jobs/:id` exposes generation job progress.
- `/api/droplinks/:id/claim/start` and `/claim/verify` handle DNS claim.
- `/api/droplinks/:id/checkout` creates checkout for one edition.
- `/api/stripe/webhook` records paid orders and edition state.
- `/api/admin/droplinks/:id/publish` publishes only after readiness checks pass.

## Runtime On Poiesis

This repo runs locally on Poiesis and is exposed by Cloudflare Tunnel.

- Web service: `droplink-web.service`
- Tunnel service: `cloudflared-droplink.service`
- Local service URL: `http://127.0.0.1:3020`
- Public URL: `https://droplink.lat`

After app code changes:

```bash
bun run build
systemctl --user restart droplink-web.service
systemctl --user status droplink-web.service --no-pager -l
curl -I http://127.0.0.1:3020/
```

Do not leave `next dev` or `bun run dev` running in the background. The tunnel should point at the managed systemd service.
