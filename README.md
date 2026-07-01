# DropLink

**LIVE IN PRODUCTION HERE, SUBMIT A LINK: https://droplink.lat**

DropLink turns any public URL into a finite physical merch drop for that URL's root domain.

It is built for internet-native merch discovery: anyone can scout a brand, creator, project, or website by pasting a link, but only the verified domain owner can claim and activate commerce. A published DropLink sells exactly 24 physical objects: 3 generated products, 8 editions each. When those 24 editions sell, the drop is complete.

Live app: https://droplink.lat

The short source-of-truth version is [DROPLINK_CORE.md](DROPLINK_CORE.md). This README explains the system end to end.

## The Product In One Sentence

Paste a link. DropLink resolves the root domain, generates a 3-product limited merch drop for that domain, lets the internet scout it, lets the domain owner claim it with DNS, and sells at most 24 physical products after operator review.

## What It Is For

DropLink is a bridge between internet attention and owned commerce.

The product answers a specific problem: a fan, scout, or community member may discover that a domain deserves a merch drop before the owner has built one. DropLink lets that person create the preview and potential upside, while keeping the owner in control. The scout can initiate the drop, but the owner must prove DNS ownership before the drop can become official commerce.

The system is intentionally finite:

- One canonical DropLink per root domain.
- Three generated products per DropLink.
- Eight editions per product.
- Twenty-four sellable physical objects total.
- DNS ownership required before a domain owner can activate the official drop.
- Operator review required before checkout opens.

## How The System Works

1. A visitor pastes a public URL into `https://droplink.lat`.
2. DropLink canonicalizes the URL to its root domain, preventing duplicate drops for different paths or subdomains.
3. If no DropLink exists, a scout can pay to create one through x402 or Stripe.
4. A queue worker crawls public signals, generates a brand study, creates three product concepts, matches real Printful products, produces assets, builds prices, creates 24 edition records, and generates social preview media.
5. The public page exists as a preview until the domain owner proves ownership with a DNS TXT record.
6. After claim, payout setup, asset readiness, and operator review, the DropLink can be published and each edition can be sold through Stripe Checkout and fulfilled through Printful draft orders.

## Who Does What

Visitor:

- Opens `https://droplink.lat`.
- Pastes a public URL.
- Sees either an existing DropLink or a preview page for a not-yet-created DropLink.

Scout:

- Pays to create a DropLink for a root domain that does not yet have one.
- Is recorded as the discoverer or creator.
- Can earn the scout side of the revenue split when the domain owner claims and the drop sells.

Domain owner:

- Proves ownership by adding a DNS TXT record at `_droplink.<rootDomain>`.
- Can configure payout later with Tempo wallet proof or Stripe Connect.
- Receives the owner side of the revenue split once the DropLink is claimed, published, and selling.

Operator:

- Uses `/admin` and `/:brandSlug/admin`.
- Watches generation progress, reviews readiness blockers, uploads or refreshes assets when needed, and publishes only when the generated drop is ready.
- Keeps unsafe states from going live: mocks, missing Printful data, unlocked price books, missing assets, unavailable editions, and similar blockers.

Buyer:

- Opens a published DropLink.
- Buys exactly one available edition through Stripe Checkout.
- The edition is reserved during checkout and becomes sold only after Stripe confirms payment.

External services:

- Cloudflare Tunnel exposes the local Poiesis service to the public internet.
- Stripe handles scout checkout and buyer checkout.
- Printful provides product catalog data, mockup tasks, and draft fulfillment orders.
- Hermes/OpenAI generate brand analysis, product concepts, copy, and images.
- R2 stores generated assets when `STORAGE_PROVIDER` is configured for R2.
- Postgres stores durable application state when `DATABASE_URL` is configured.
- Redis backs BullMQ generation jobs when `REDIS_URL` is configured.

## Where It Runs

DropLink currently runs on Poiesis, this local machine.

Public traffic:

1. A user visits `https://droplink.lat` or `https://www.droplink.lat`.
2. Cloudflare terminates public HTTPS.
3. `cloudflared-droplink.service` opens the tunnel from Poiesis to Cloudflare.
4. The tunnel forwards traffic to `http://127.0.0.1:3020`.
5. `droplink-web.service` receives the request and runs the Next.js production server.

Current local services:

- `droplink-web.service`: Next.js app server.
- `droplink-worker.service`: BullMQ generation worker.
- `cloudflared-droplink.service`: Cloudflare Tunnel for `droplink.lat`.

Current local ports and commands:

- Web app listens on `127.0.0.1:3020`.
- Web service command: `bun run start -- -H 127.0.0.1 -p 3020`.
- Worker command: `bun run worker`.
- Both web and worker read `/home/kithkui/.config/droplink/production.env`.
- The repo lives at `/home/kithkui/code/droplink`.

The Cloudflare tunnel config maps:

- `droplink.lat` to `http://127.0.0.1:3020`
- `www.droplink.lat` to `http://127.0.0.1:3020`

## Runtime Process Boundaries

Next.js web process:

- Renders public pages.
- Handles URL lookup, scout payment setup, claim requests, checkout requests, webhook endpoints, admin actions, and job polling.
- Creates initial generation job records.
- Enqueues long-running generation work.
- Does not sit in a terminal. It is managed by `droplink-web.service`.

Generation worker process:

- Runs separately from the web server as `droplink-worker.service`.
- Consumes jobs from the `droplink-generation` BullMQ queue.
- Calls the generation pipeline in `src/lib/generateDrop.ts`.
- Writes job events so the UI can show live progress.
- Retries failed queue jobs according to BullMQ settings.

Database and queue:

- Postgres is selected by `DATABASE_URL`.
- Redis is selected by `REDIS_URL`.
- In production mode, Redis is required for queues.
- In local development without Redis, generation can run inline as a development fallback.

Storage:

- Generated assets can be stored locally or in R2 depending on `STORAGE_PROVIDER`.
- Production configuration includes R2 variables, so public generated images should be treated as remotely stored assets.

## The User Flow In Detail

### 1. Landing Page

File: [src/components/LandingFlow.tsx](src/components/LandingFlow.tsx)

The first screen is the app itself, not a marketing page. It has:

- A URL input.
- A submit button.
- A link to `/directory`.
- Example generated products in the lower preview area.

When a visitor submits a URL:

1. The client validates that the input can be parsed as `http` or `https`.
2. The client calls `/api/droplinks/lookup?url=<input>`.
3. The API normalizes and canonicalizes the URL.
4. If the domain already exists, the API returns the existing slug.
5. If the domain is new, the API returns enough preview data to route the user to `/:brandSlug?url=...`.

### 2. Canonical Domain Identity

Files:

- [src/lib/dropCanonicalization.ts](src/lib/dropCanonicalization.ts)
- [src/lib/urls.ts](src/lib/urls.ts)
- [src/lib/hashes.ts](src/lib/hashes.ts)

DropLink does not create separate drops for every URL path or subdomain.

Example:

- `https://shop.example.com/products/hat`
- `https://www.example.com/about`
- `https://example.com`

All resolve to the same root-domain DropLink identity for `example.com`.

The canonicalization step records:

- Original submitted URL.
- Submitted host.
- Submitted path.
- Canonical URL.
- Canonical root domain.
- Root domain hash.

The root domain hash is what prevents duplicate drops for the same domain.

### 3. Empty Preview Page

File: [src/app/[brandSlug]/page.tsx](src/app/[brandSlug]/page.tsx)

If no stored DropLink exists yet, `/:brandSlug` renders an empty preview state using querystring data from lookup.

That page lets the visitor:

- Read the guessed title and description.
- See the target domain.
- Start scouting with x402.
- Start scouting with Stripe.

No products exist yet at this point. The page is only a pre-generation shell.

### 4. Scout Payment

Files:

- [src/app/api/droplinks/summon/route.ts](src/app/api/droplinks/summon/route.ts)
- [src/app/api/droplinks/scout/stripe/route.ts](src/app/api/droplinks/scout/stripe/route.ts)
- [src/lib/x402.ts](src/lib/x402.ts)
- [src/lib/stripe.ts](src/lib/stripe.ts)

There are two scout paths:

- x402 summon payment through `/api/droplinks/summon`.
- Stripe scout checkout through `/api/droplinks/scout/stripe`.

Both paths end by creating or queueing the same kind of generation job. The scout payment records who discovered the domain and why generation is allowed to begin.

If the submitted root domain already exists, the API returns the existing DropLink instead of charging again.

### 5. Scout Shell Creation

File: [src/lib/queues.ts](src/lib/queues.ts)

Before the long generation work starts, the app creates a durable shell:

- `drop`
- `brand`
- `storefront`
- `generation_job`
- initial `drop_source_signal`
- DNS claim nonce
- public slug

The drop starts as:

- `status: summoned`
- `domainClaimStatus: unclaimed`
- `payoutStatus: missing`
- `publishStatus: blocked`
- `commerceMode: preview`

This means the public page can exist immediately, the job can be tracked, and the owner can later claim the same stable DropLink.

### 6. Queueing And Processing

Files:

- [src/lib/queues.ts](src/lib/queues.ts)
- [src/worker.ts](src/worker.ts)
- [src/app/api/jobs/[id]/route.ts](src/app/api/jobs/[id]/route.ts)

In production on Poiesis:

1. The web process writes the generation job and payload.
2. The web process enqueues a BullMQ job named `droplink-generation`.
3. Redis stores the queue state.
4. `droplink-worker.service` receives the job.
5. The worker calls `generateDropFromUrl`.
6. The worker records progress events as each step completes.
7. The public page polls `/api/jobs/:id` to display progress.

This is why generation can take time without blocking the public HTTP request.

### 7. Generation Pipeline

File: [src/lib/generateDrop.ts](src/lib/generateDrop.ts)

The generation worker performs the full DropLink creation pipeline:

1. Crawl and scrape public signals from the submitted URL.
2. Build a brand dossier.
3. Ask Hermes/OpenAI for brand study and product direction.
4. Plan exactly three relics/products.
5. Match each product to real Printful catalog options.
6. Generate or prepare print artwork.
7. Validate print files.
8. Generate lifestyle or product imagery.
9. Request or refresh mockups.
10. Create the price book.
11. Create projected economics.
12. Create the OG image.
13. Create 24 edition records.
14. Mark generation ready for review.

The visible job states include steps such as:

- `CRAWLING`
- `DISCOVERING_BRAND`
- `BUILDING_DOSSIER`
- `PLANNING_RELICS`
- `MATCHING_PRINTFUL`
- `GENERATING_PRINT_FILES`
- `GENERATING_MOCKUPS`
- `GENERATING_OG`
- `READY_FOR_REVIEW`
- `PUBLISHED`
- `FAILED`

### 8. Generated Public Page

Files:

- [src/app/[brandSlug]/page.tsx](src/app/[brandSlug]/page.tsx)
- [src/components/DroplinkExperience.tsx](src/components/DroplinkExperience.tsx)
- [src/components/DropProductCard.tsx](src/components/DropProductCard.tsx)

Once generated, the public page shows:

- Brand title and description.
- The three generated products.
- Product image, price, remaining editions, and state.
- Potential earnings at the top-right:
  - Claimer/scout: 8% of max gross revenue.
  - Domain owner: 92% of max gross revenue.
- Claim prompt if the domain is not claimed.
- Checkout controls only when commerce is enabled.

The potential earnings block is display-only. It is calculated from generated product prices and edition supply. Real settlement still depends on actual paid orders and configured payout rails.

### 9. Directory

File: [src/app/directory/page.tsx](src/app/directory/page.tsx)

The landing page has a `Directory` link. `/directory` lists public generated droplinks that pass storefront readiness filters.

Each row links to `/:brandSlug`, so a visitor can browse generated drops by brand/domain.

### 10. Domain Claim

Files:

- [src/app/api/droplinks/[id]/claim/start/route.ts](src/app/api/droplinks/[id]/claim/start/route.ts)
- [src/app/api/droplinks/[id]/claim/verify/route.ts](src/app/api/droplinks/[id]/claim/verify/route.ts)
- [src/lib/dnsClaim.ts](src/lib/dnsClaim.ts)

Claiming is DNS-based.

The app gives the claimant:

- DNS record name: `_droplink.<rootDomain>`
- DNS record value: `droplink-claim=<nonce>`

The domain owner adds that TXT record at their DNS provider. The verify endpoint looks up DNS and checks for the nonce. If it matches, the DropLink becomes claimed.

Important rule: being the scout does not prove ownership. DNS proves ownership.

### 11. Payout Setup

Files:

- [src/app/api/droplinks/[id]/payout/tempo/start/route.ts](src/app/api/droplinks/[id]/payout/tempo/start/route.ts)
- [src/app/api/droplinks/[id]/payout/tempo/verify/route.ts](src/app/api/droplinks/[id]/payout/tempo/verify/route.ts)
- [src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts](src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts)

Payout is separate from ownership.

A domain can be claimed first, then payout can be configured later.

Supported payout paths in the code:

- Tempo wallet proof with a fresh DNS TXT record at `_droplink-payout.<rootDomain>`.
- Stripe Connect onboarding.

Missing payout setup blocks withdrawals or external payout actions. It does not erase internal accounting.

### 12. Operator Review And Publish

Files:

- [src/app/admin/page.tsx](src/app/admin/page.tsx)
- [src/app/[brandSlug]/admin/page.tsx](src/app/[brandSlug]/admin/page.tsx)
- [src/components/AdminDropWorkflow.tsx](src/components/AdminDropWorkflow.tsx)
- [src/components/AdminLiveConsole.tsx](src/components/AdminLiveConsole.tsx)
- [src/app/api/admin/droplinks/[id]/publish/route.ts](src/app/api/admin/droplinks/[id]/publish/route.ts)

The operator reviews the generated DropLink before it can sell.

Readiness checks protect the product invariant. A DropLink should not publish if it has:

- Missing collection.
- Missing three relics/products.
- Missing 24 editions.
- Missing or unlocked price book.
- Missing product assets.
- Mock assets in production.
- Missing Printful references.
- Missing claim when claim is required.
- Any other configured blocker.

Publishing locks the drop into the public commerce state and enables checkout for available editions.

### 13. Buyer Checkout

Files:

- [src/app/api/droplinks/[id]/checkout/route.ts](src/app/api/droplinks/[id]/checkout/route.ts)
- [src/components/CheckoutButton.tsx](src/components/CheckoutButton.tsx)
- [src/lib/stripe.ts](src/lib/stripe.ts)

Checkout is edition-based.

When a buyer clicks buy:

1. The API verifies the DropLink is published.
2. The API verifies the selected relic/product exists.
3. The API finds an available edition.
4. The API reserves that edition.
5. The API creates a Stripe Checkout session.
6. The buyer completes payment on Stripe.

No cart exists. No unlimited inventory exists. The unit being bought is one edition from the 24-edition supply.

### 14. Stripe Webhook And Fulfillment

Files:

- [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts)
- [src/lib/store.ts](src/lib/store.ts)
- [src/lib/economics.ts](src/lib/economics.ts)
- [src/lib/printful.ts](src/lib/printful.ts)

Stripe is the source of truth for completed payment.

When Stripe confirms checkout completion:

1. The webhook verifies the Stripe signature.
2. The reserved edition becomes sold.
3. An internal order is created.
4. The settled economics waterfall is calculated.
5. Ledger accruals are recorded.
6. A Printful draft order is created.
7. If all 24 editions are sold, the DropLink becomes `sold_out`.

Printful orders are draft orders when `PRINTFUL_CONFIRM_ORDERS=false`. That is the intended safe production mode while fulfillment is manually supervised.

## Money Flow

The public UI shows potential revenue:

- Claimer/scout: 8%
- Domain owner: 92%

Those percentages come from [src/lib/protocol.ts](src/lib/protocol.ts):

- `SCOUT_BPS = 800`
- `OWNER_BPS_WITH_SCOUT = 9200`

The displayed potential earnings are calculated from max gross revenue:

```text
sum(product price * total supply) * split percentage
```

Actual accounting is more conservative. Order settlement can account for:

- Gross payment.
- Taxes.
- Shipping pass-through or shipping cost.
- Stripe fees.
- Printful production cost.
- Refund reserve.
- Creator or scout bounty.
- Domain owner proceeds.
- Protocol fee if configured.

If a sale has zero or negative margin, internal payouts become zero and the order needs admin review.

## Data Model At A Glance

Core tables and concepts:

- `drops`: canonical domain-level drop and ownership state.
- `drop_source_signals`: submitted URLs and paths used as source material.
- `brands`: domain-level brand identity.
- `storefronts`: public slug, status, commerce mode, and generation state.
- `collections`: generated drop collection.
- `relics`: the three generated products.
- `relic_editions`: the 24 sellable units.
- `assets`: generated print files, previews, and source imagery.
- `mockups`: product mockup images.
- `og_images`: generated social preview image.
- `generation_jobs`: long-running generation job state.
- `system_events`: user-visible/admin-visible event log.
- `checkout_sessions`: Stripe checkout tracking.
- `orders`: paid order records.
- `ledger_accruals`: internal proceeds and bounty accounting.
- `fulfillment_orders`: Printful draft order tracking.
- `drop_notifications`: notification signups for preview products.

## Important Routes

Public pages:

- `GET /`
- `GET /directory`
- `GET /:brandSlug`
- `GET /:brandSlug/admin`
- `GET /claim/:id`
- `GET /about`
- `GET /about.md`
- `GET /terms`

DropLink APIs:

- `GET /api/droplinks/lookup`
- `POST /api/droplinks/summon`
- `POST /api/droplinks/scout/stripe`
- `GET /api/jobs/:id`
- `POST /api/droplinks/:id/notifications`
- `POST /api/droplinks/:id/claim/start`
- `POST /api/droplinks/:id/claim/verify`
- `POST /api/droplinks/:id/payout/tempo/start`
- `POST /api/droplinks/:id/payout/tempo/verify`
- `POST /api/droplinks/:id/payout/stripe-connect/start`
- `POST /api/droplinks/:id/checkout`

Admin APIs:

- `GET /api/admin/live`
- `POST /api/admin/generate`
- `POST /api/admin/login`
- `GET /api/admin/droplinks/:id/readiness`
- `POST /api/admin/droplinks/:id/manual-assets`
- `POST /api/admin/droplinks/:id/refresh-mockups`
- `POST /api/admin/droplinks/:id/publish`
- `POST /api/admin/droplinks/:id/archive`

Webhook APIs:

- `POST /api/stripe/webhook`
- `POST /api/printful/webhook`

## Code Map

Core data and workflow:

- [src/lib/schema.ts](src/lib/schema.ts) defines database tables.
- [src/lib/types.ts](src/lib/types.ts) defines app-level TypeScript shapes.
- [src/lib/store.ts](src/lib/store.ts) is the persistence and workflow state layer.
- [src/lib/protocol.ts](src/lib/protocol.ts) defines public DropLink statuses and split constants.
- [drizzle/migrations](drizzle/migrations) contains production migrations.

URL identity:

- [src/lib/dropCanonicalization.ts](src/lib/dropCanonicalization.ts)
- [src/lib/urls.ts](src/lib/urls.ts)
- [src/lib/hashes.ts](src/lib/hashes.ts)

Generation:

- [src/lib/generateDrop.ts](src/lib/generateDrop.ts)
- [src/lib/hermesDropAgent.ts](src/lib/hermesDropAgent.ts)
- [src/lib/scrape.ts](src/lib/scrape.ts)
- [src/lib/imageProvider.ts](src/lib/imageProvider.ts)
- [src/lib/mockups.ts](src/lib/mockups.ts)
- [src/lib/og.ts](src/lib/og.ts)
- [src/lib/queues.ts](src/lib/queues.ts)
- [src/worker.ts](src/worker.ts)

Payments, economics, and fulfillment:

- [src/lib/x402.ts](src/lib/x402.ts)
- [src/lib/stripe.ts](src/lib/stripe.ts)
- [src/lib/pricing.ts](src/lib/pricing.ts)
- [src/lib/economics.ts](src/lib/economics.ts)
- [src/lib/settlement.ts](src/lib/settlement.ts)
- [src/lib/printful.ts](src/lib/printful.ts)

Claim and payout:

- [src/lib/dnsClaim.ts](src/lib/dnsClaim.ts)
- [src/app/api/droplinks/[id]/claim/start/route.ts](src/app/api/droplinks/[id]/claim/start/route.ts)
- [src/app/api/droplinks/[id]/claim/verify/route.ts](src/app/api/droplinks/[id]/claim/verify/route.ts)
- [src/app/api/droplinks/[id]/payout/tempo/start/route.ts](src/app/api/droplinks/[id]/payout/tempo/start/route.ts)
- [src/app/api/droplinks/[id]/payout/tempo/verify/route.ts](src/app/api/droplinks/[id]/payout/tempo/verify/route.ts)
- [src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts](src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts)

UI:

- [src/components/LandingFlow.tsx](src/components/LandingFlow.tsx)
- [src/components/DroplinkExperience.tsx](src/components/DroplinkExperience.tsx)
- [src/components/DropProductCard.tsx](src/components/DropProductCard.tsx)
- [src/components/CheckoutButton.tsx](src/components/CheckoutButton.tsx)
- [src/app/directory/page.tsx](src/app/directory/page.tsx)
- [src/components/AdminDropWorkflow.tsx](src/components/AdminDropWorkflow.tsx)
- [src/components/AdminLiveConsole.tsx](src/components/AdminLiveConsole.tsx)

## Operating The Poiesis Deployment

Use the managed services. Do not leave `next dev`, `bun run dev`, or other ad hoc servers running.

Check status:

```bash
systemctl --user status droplink-web.service --no-pager -l
systemctl --user status droplink-worker.service --no-pager -l
systemctl --user status cloudflared-droplink.service --no-pager -l
```

After app changes:

```bash
bun run build
systemctl --user restart droplink-web.service
systemctl --user restart droplink-worker.service
curl -I http://127.0.0.1:3020/
```

If the web service fails with `EADDRINUSE` on `127.0.0.1:3020`, find and stop the stale process holding the port before restarting:

```bash
ss -ltnp | rg ':3020'
```

## Local Development

Use Bun only.

```bash
bun install
bun run dev
```

Development server:

- `bun run dev` uses `localhost:3000`.
- The real tunneled Poiesis runtime uses `127.0.0.1:3020`.
- Do not confuse a temporary dev server with the production-like local service.

Useful checks:

```bash
bun run typecheck
bun test
bun run build
```

Run the worker manually only when testing queue behavior outside systemd:

```bash
bun run worker
```

## Environment

Production services read `/home/kithkui/.config/droplink/production.env`.

Core:

- `DATABASE_URL`
- `REDIS_URL`
- `DROPLINK_PUBLIC_BASE_URL`
- `DROPLINK_API_KEY`
- `DROPLINK_REQUIRE_GENERATION_KEY`
- `ALLOW_MOCKS`

AI and generation:

- `AI_PROVIDER`
- `IMAGE_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `HERMES_MODE`
- `HERMES_BRIDGE_URL`
- `HERMES_BRIDGE_TOKEN`
- `HERMES_AGENT_FALLBACK`
- `HERMES_BRIDGE_USE_TASKS`

Stripe:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Printful:

- `PRINTFUL_API_KEY`
- `PRINTFUL_API_BASE`
- `PRINTFUL_STORE_ID`
- `PRINTFUL_CONFIRM_ORDERS=false`
- `PRINTFUL_WEBHOOK_SECRET`
- `PRINTFUL_DEFAULT_SHIPPING`
- `PRINTFUL_CURRENCY`

Storage:

- `STORAGE_PROVIDER`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Economics:

- `DROPLINK_SUMMON_PRICE_USDC`
- `DROPLINK_CREATOR_BOUNTY_BPS`
- `DROPLINK_PROTOCOL_FEE_BPS`
- `DROPLINK_TOTAL_SUPPLY`
- `DROPLINK_RELICS_PER_DROP`
- `DROPLINK_EDITIONS_PER_RELIC`

x402 and Tempo:

- `X402_ENABLED`
- `X402_NETWORK`
- `X402_ACCEPTED_ASSET`
- `X402_RECIPIENT_ADDRESS`
- `X402_FACILITATOR_URL`
- `TEMPO_ENABLED`
- `TEMPO_RPC_URL`
- `TEMPO_CHAIN_ID`
- `TEMPO_USDC_ADDRESS`
- `TEMPO_SETTLEMENT_CONTRACT_ADDRESS`
- `TEMPO_SETTLEMENT_PRIVATE_KEY`

## Contribution Rules

- Keep the finite-drop invariant intact.
- Do not reintroduce subscriptions, premium plans, weekly drops, carts, or infinite products.
- Do not hardcode Printful variants.
- Do not publish mocks.
- Do not fake payment, fulfillment, DNS ownership, or onchain settlement.
- Keep generated product descriptors flexible, but keep operational states and ids explicit.
- Add tests when changing canonicalization, checkout, economics, fulfillment, readiness, or webhook behavior.
- Run `bun run typecheck`, `bun test`, and `bun run build` before shipping code changes.
