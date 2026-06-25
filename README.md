# DropLink

DropLink turns a root domain into one finite merch market.

Anyone can summon a domain. Only the domain owner can claim it, by proving DNS control. A claimed and published DropLink sells exactly 24 physical objects: 3 relics, 8 editions each. When the 24 editions are gone, the drop is complete forever.

Live app: https://droplink.lat

## Product Truth

- One registrable/root domain maps to one DropLink.
- Subdomains and paths are source signals, not separate drops.
- A DropLink has exactly 3 relics.
- Each relic has exactly 8 editions.
- Total supply is exactly 24.
- Status is `summoned`, `claimed`, `published`, `sold_out`, or `archived`.
- Unclaimed drops can be previewed and claimed, but cannot sell.
- Claimed drops still cannot sell until readiness passes and an operator publishes them.
- Published drops sell one edition at a time at the locked price-book price.
- Sold, reserved, and sold-out editions cannot be bought again.
- Stripe takes payment.
- Printful receives real draft orders.
- `PRINTFUL_CONFIRM_ORDERS=false` is the intended safe/manual production mode.
- There are no subscriptions, premium plans, carts, unlimited products, or fake scarcity.

## Mechanism

1. A URL is submitted.
2. DropLink canonicalizes it to the root domain with a public-suffix-aware parser.
3. If that root domain already has a DropLink, the existing drop is returned and no new payment is required.
4. If it is new, a real x402/stablecoin summon payment is required.
5. The summoner is recorded as the creator/discoverer.
6. Hermes generates the drop: brand study, 3 relic concepts, dynamic Printful variants, print files, mockups, price book, projected economics, OG image, and 24 edition records.
7. The domain owner claims with DNS TXT at `_droplink.<rootDomain>`.
8. Payout setup happens after claim: Tempo USDC wallet or Stripe Connect.
9. Operator publish locks the price book and enables checkout.
10. Stripe webhook marks editions sold, creates internal orders, creates Printful draft orders, and records settled economics.
11. Ledger accruals track creator bounty, owner proceeds, and protocol fees.

## Code Map

Core data model:

- [src/lib/schema.ts](src/lib/schema.ts) defines the database tables.
- [src/lib/types.ts](src/lib/types.ts) defines the app-level TypeScript shapes.
- [drizzle/migrations](drizzle/migrations) contains production migrations.
- [src/lib/store.ts](src/lib/store.ts) is the main persistence layer and workflow state machine.

Canonical identity:

- [src/lib/dropCanonicalization.ts](src/lib/dropCanonicalization.ts) turns submitted URLs into canonical root-domain DropLink identity.
- [src/lib/urls.ts](src/lib/urls.ts) normalizes URL input.
- [src/lib/hashes.ts](src/lib/hashes.ts) creates deterministic ids/hashes.

Generation pipeline:

- [src/lib/generateDrop.ts](src/lib/generateDrop.ts) orchestrates one finite DropLink generation.
- [src/lib/hermesDropAgent.ts](src/lib/hermesDropAgent.ts) calls the LLM for brand study and relic planning.
- [src/lib/scrape.ts](src/lib/scrape.ts) extracts source-site signals.
- [src/lib/imageProvider.ts](src/lib/imageProvider.ts) generates print artwork.
- [src/lib/og.ts](src/lib/og.ts) creates the OG image from the selected relics/products.
- [src/lib/queues.ts](src/lib/queues.ts) enqueues generation jobs.
- [src/worker.ts](src/worker.ts) runs the Railway worker.

Printful fulfillment:

- [src/lib/printful.ts](src/lib/printful.ts) handles catalog lookup, dynamic product/variant scoring, mockup tasks, and draft order creation.
- [src/app/api/printful/webhook/route.ts](src/app/api/printful/webhook/route.ts) receives Printful events.

Payments and economics:

- [src/lib/x402.ts](src/lib/x402.ts) verifies summon payments.
- [src/lib/stripe.ts](src/lib/stripe.ts) creates Stripe Checkout sessions.
- [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) handles paid/expired checkout events.
- [src/lib/pricing.ts](src/lib/pricing.ts) creates price books and projected economics.
- [src/lib/economics.ts](src/lib/economics.ts) calculates settled order waterfall.
- [src/lib/settlement.ts](src/lib/settlement.ts) records settlement/Tempo-ready receipts and blocks fake onchain claims.

DNS claim and payout:

- [src/lib/dnsClaim.ts](src/lib/dnsClaim.ts) parses and verifies DNS TXT records.
- [src/app/api/droplinks/[id]/claim/start/route.ts](src/app/api/droplinks/[id]/claim/start/route.ts) starts walletless domain claim.
- [src/app/api/droplinks/[id]/claim/verify/route.ts](src/app/api/droplinks/[id]/claim/verify/route.ts) verifies `_droplink.<rootDomain>`.
- [src/app/api/droplinks/[id]/payout/tempo/start/route.ts](src/app/api/droplinks/[id]/payout/tempo/start/route.ts) starts Tempo wallet proof.
- [src/app/api/droplinks/[id]/payout/tempo/verify/route.ts](src/app/api/droplinks/[id]/payout/tempo/verify/route.ts) verifies `_droplink-payout.<rootDomain>`.
- [src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts](src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts) starts Stripe Connect onboarding.

Public and admin UI:

- [src/app/page.tsx](src/app/page.tsx) is the public home/feed.
- [src/app/[brandSlug]/page.tsx](src/app/[brandSlug]/page.tsx) is the simple public DropLink page.
- [src/components/DropProductCard.tsx](src/components/DropProductCard.tsx) renders the three product cards and checkout button.
- [src/components/ThemeLink.tsx](src/components/ThemeLink.tsx) toggles the generated-theme page mutation.
- [src/app/about/page.tsx](src/app/about/page.tsx) explains the project for humans.
- [src/app/about.md/route.ts](src/app/about.md/route.ts) explains the project for agents.
- [src/app/admin/page.tsx](src/app/admin/page.tsx) is the operator console.
- [src/components/AdminLiveConsole.tsx](src/components/AdminLiveConsole.tsx) polls live generation state, logs, images, relics, editions, and blockers.
- [src/app/api/admin/live/route.ts](src/app/api/admin/live/route.ts) powers the live admin console.

Config, logging, and safety:

- [src/lib/env.ts](src/lib/env.ts) reads and validates DropLink config.
- [src/lib/logger.ts](src/lib/logger.ts) emits structured logs.
- [src/lib/rateLimit.ts](src/lib/rateLimit.ts) provides request rate limiting.
- [src/lib/storage.ts](src/lib/storage.ts) stores generated assets locally or in R2.
- [src/middleware.ts](src/middleware.ts) handles route middleware.

Tests:

- [src/lib/atelier.test.ts](src/lib/atelier.test.ts) covers canonicalization, DNS claim, payout setup, pricing, checkout readiness, Printful metadata, and economics.

## Routes

Public:

- `GET /`
- `GET /:brandSlug`
- `GET /about`
- `GET /about.md`

Admin:

- `GET /admin`
- `GET /api/admin/live`
- `POST /api/admin/generate`
- `POST /api/admin/droplinks/:id/publish`
- `POST /api/admin/droplinks/:id/archive`
- `GET /api/admin/droplinks/:id/readiness`
- `POST /api/admin/droplinks/:id/refresh-mockups`

DropLink API:

- `POST /api/droplinks/summon`
- `POST /api/droplinks/:id/claim/start`
- `POST /api/droplinks/:id/claim/verify`
- `POST /api/droplinks/:id/payout/tempo/start`
- `POST /api/droplinks/:id/payout/tempo/verify`
- `POST /api/droplinks/:id/payout/stripe-connect/start`
- `POST /api/droplinks/:id/checkout`

Webhooks:

- `POST /api/stripe/webhook`
- `POST /api/printful/webhook`

## Local Development

Use Bun only. Do not use npm, pnpm, or yarn.

Minimal setup:

```bash
git clone <repo-url>
cd droplink
bun install
```

Then run with one environment variable:

```bash
OPENAI_API_KEY=sk-... bun run dev
```

Or copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and run:

```bash
cp .env.example .env.local
bun dev
```

Open `http://localhost:3000`.

With only `OPENAI_API_KEY`, local development uses:

- JSON file storage at `data/store.json` instead of Postgres.
- Inline generation instead of Redis/BullMQ.
- Local generated asset URLs instead of R2.
- Development-only Printful catalog placeholders for product selection.
- Commerce blocked until real Stripe, Printful, x402, DNS claim, and readiness are configured.

Useful commands:

```bash
bun run typecheck
bun run check
bun test
bun run build
bun run db:migrate
```

Run the worker locally only when testing Redis-backed queued generation:

```bash
bun run worker
```

## Environment

Core:

- `DATABASE_URL`
- `REDIS_URL`
- `DROPLINK_PUBLIC_BASE_URL`
- `DROPLINK_API_KEY`
- `DROPLINK_REQUIRE_GENERATION_KEY`
- `ALLOW_MOCKS`

`DATABASE_URL` and `REDIS_URL` can be empty in local development. They are required for production-style persistence and queues.

AI:

- `AI_PROVIDER=openai`
- `IMAGE_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `HERMES_MODE=agent`
- `HERMES_BRIDGE_URL=https://hermes.anky.app`
- `HERMES_BRIDGE_PATH=/prompt`
- `HERMES_BRIDGE_MODE=agent`
- `HERMES_BRIDGE_MAX_TOKENS=3500`
- `HERMES_BRIDGE_TOKEN`
- `HERMES_AGENT_FALLBACK=true`

Stripe:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Printful:

- `PRINTFUL_API_KEY`
- `PRINTFUL_API_BASE`
- `PRINTFUL_STORE_ID`
- `PRINTFUL_CONFIRM_ORDERS=false`
- `PRINTFUL_DEFAULT_SHIPPING`
- `PRINTFUL_CURRENCY`
- `PRINTFUL_WEBHOOK_SECRET`

Storage:

- `STORAGE_PROVIDER`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Drop economics:

- `DROPLINK_SUMMON_PRICE_USDC=8`
- `DROPLINK_TREASURY_ADDRESS`
- `DROPLINK_CREATOR_BOUNTY_BPS=800`
- `DROPLINK_PROTOCOL_FEE_BPS=0`
- `DROPLINK_TOTAL_SUPPLY=24`
- `DROPLINK_RELICS_PER_DROP=3`
- `DROPLINK_EDITIONS_PER_RELIC=8`
- `DROPLINK_REQUIRE_PAYOUT_BEFORE_PUBLISH=false`
- `DROPLINK_MIN_UNIT_MARGIN_USD=12`
- `DROPLINK_PRICE_SAFETY_BUFFER_BPS=1000`
- `DROPLINK_DEFAULT_REFUND_RESERVE_BPS=300`
- `DROPLINK_MIN_UNIT_PRICE_USD=32`
- `DROPLINK_MAX_UNIT_PRICE_USD=188`

x402 and Tempo:

- `X402_ENABLED`
- `X402_NETWORK=tempo`
- `X402_ACCEPTED_ASSET=USDC`
- `X402_RECIPIENT_ADDRESS`
- `X402_FACILITATOR_URL`
- `TEMPO_ENABLED`
- `TEMPO_RPC_URL`
- `TEMPO_CHAIN_ID`
- `TEMPO_USDC_ADDRESS`
- `TEMPO_SETTLEMENT_CONTRACT_ADDRESS`
- `TEMPO_SETTLEMENT_PRIVATE_KEY`

If x402 config is missing, new paid summons are refused. If Tempo config is missing, internal ledger state can still exist, but onchain settlement and payout actions are blocked. The app must never claim onchain settlement happened without a real transaction hash.

## Manual Operator Flow

1. Open `/admin`.
2. Submit a public URL.
3. Watch the live console for crawl, brand study, relic plan, Printful matching, print files, mockups, price book, OG image, and readiness.
4. Open the generated DropLink page.
5. Start claim and add `_droplink.<rootDomain>` TXT with the returned nonce.
6. Verify claim.
7. Configure payout later with Tempo wallet DNS proof or Stripe Connect.
8. Publish only after readiness passes.
9. Buy one edition through Stripe Checkout.
10. Confirm the Stripe webhook sold exactly one edition, created one order, created one Printful draft order, and accrued ledger balances.
11. Confirm the drop moves to `sold_out` after all 24 editions are sold.

## Contribution Rules

- Keep the finite-drop invariant intact.
- Do not reintroduce subscriptions, premium plans, weekly drops, carts, or infinite products.
- Do not hardcode Printful variants.
- Do not publish mocks.
- Do not fake payment, fulfillment, DNS ownership, or onchain settlement.
- Keep generated product descriptors flexible, but keep operational states and ids explicit.
- Add tests when changing canonicalization, checkout, economics, fulfillment, readiness, or webhook behavior.
- Run `bun run typecheck`, `bun run check`, `bun test`, and `bun run build` before shipping.
