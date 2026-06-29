# DropLink

DropLink turns a public URL into one finite physical merch market for that URL's root domain.

Anyone can scout a domain. Only the domain owner can claim it with DNS. A claimed and published DropLink sells exactly 24 physical objects: 3 products, 8 editions each. When those 24 editions are gone, the drop is complete.

Live app: https://droplink.lat

For the concise product and runtime source of truth, read [DROPLINK_CORE.md](DROPLINK_CORE.md).

## How It Works

1. A visitor pastes a URL on `/`.
2. DropLink canonicalizes it to the registrable root domain.
3. If a DropLink already exists for that root domain, the visitor is sent to it.
4. If it is new, the visitor can scout it by paying the summon fee through x402 or Stripe.
5. The generation pipeline creates a brand study, 3 products, print assets, mockups, a price book, projected economics, an OG image, and edition records.
6. The generated page shows the products and the potential earnings split: claimer 8%, domain owner 92%.
7. The domain owner claims the DropLink by adding a DNS TXT record.
8. An operator publishes only after readiness checks pass.
9. Buyers purchase one edition at a time through Stripe Checkout.
10. Stripe webhooks mark editions sold, create orders, create Printful draft orders, and record ledger accruals.

## Product Truth

- One registrable/root domain maps to one DropLink.
- Subdomains and paths are source signals, not separate drops.
- A DropLink has exactly 3 products: Wear, Display, and Use.
- Each product has exactly 8 editions.
- Total supply is exactly 24.
- Status is `summoned`, `claimed`, `published`, `sold_out`, or `archived`.
- Unclaimed drops can be previewed and claimed, but cannot sell.
- Claimed drops still cannot sell until readiness passes and an operator publishes them.
- Published drops sell one edition at a time at the locked price-book price.
- Sold, reserved, and sold-out editions cannot be bought again.
- Printful receives real draft orders.
- `PRINTFUL_CONFIRM_ORDERS=false` is the intended safe/manual production mode.
- There are no subscriptions, premium plans, carts, unlimited products, or fake scarcity.

## Public Surface

- `/` is the mobile-first landing and URL input flow.
- `/directory` lists generated public droplinks.
- `/:brandSlug` is the public DropLink page.
- `/:brandSlug/admin` is the per-drop admin page.
- `/admin` is the operator console.
- `/claim/:id` is the domain claim flow.
- `/about`, `/about.md`, and `/terms` provide public context and legal copy.

## Code Map

Core data and workflow:

- [src/lib/schema.ts](src/lib/schema.ts) defines the database tables.
- [src/lib/types.ts](src/lib/types.ts) defines the TypeScript shapes.
- [src/lib/store.ts](src/lib/store.ts) is the main persistence and workflow layer.
- [src/lib/protocol.ts](src/lib/protocol.ts) defines public DropLink statuses and revenue split constants.
- [drizzle/migrations](drizzle/migrations) contains production migrations.

URL identity:

- [src/lib/dropCanonicalization.ts](src/lib/dropCanonicalization.ts) turns submitted URLs into canonical root-domain identity.
- [src/lib/urls.ts](src/lib/urls.ts) normalizes URL input.
- [src/lib/hashes.ts](src/lib/hashes.ts) creates deterministic ids and hashes.

Generation:

- [src/lib/generateDrop.ts](src/lib/generateDrop.ts) orchestrates DropLink generation.
- [src/lib/hermesDropAgent.ts](src/lib/hermesDropAgent.ts) calls Hermes/LLM flows for brand study and relic planning.
- [src/lib/scrape.ts](src/lib/scrape.ts) extracts source-site signals.
- [src/lib/imageProvider.ts](src/lib/imageProvider.ts) generates product artwork.
- [src/lib/mockups.ts](src/lib/mockups.ts) handles product mockup references.
- [src/lib/og.ts](src/lib/og.ts) creates share imagery.
- [src/lib/queues.ts](src/lib/queues.ts) enqueues generation jobs.
- [src/worker.ts](src/worker.ts) runs queued generation work.

Payments, economics, and fulfillment:

- [src/lib/x402.ts](src/lib/x402.ts) verifies summon payments.
- [src/lib/stripe.ts](src/lib/stripe.ts) creates Stripe Checkout sessions and reads Stripe state.
- [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) handles checkout completion and expiry.
- [src/lib/pricing.ts](src/lib/pricing.ts) creates price books and projected economics.
- [src/lib/economics.ts](src/lib/economics.ts) calculates settled order waterfall.
- [src/lib/settlement.ts](src/lib/settlement.ts) records settlement and blocks fake onchain claims.
- [src/lib/printful.ts](src/lib/printful.ts) handles Printful catalog lookup, mockups, and draft orders.

Claim and payout:

- [src/lib/dnsClaim.ts](src/lib/dnsClaim.ts) verifies DNS TXT ownership and payout proofs.
- [src/app/api/droplinks/[id]/claim/start/route.ts](src/app/api/droplinks/[id]/claim/start/route.ts) starts claim.
- [src/app/api/droplinks/[id]/claim/verify/route.ts](src/app/api/droplinks/[id]/claim/verify/route.ts) verifies claim.
- [src/app/api/droplinks/[id]/payout/tempo/start/route.ts](src/app/api/droplinks/[id]/payout/tempo/start/route.ts) starts Tempo payout proof.
- [src/app/api/droplinks/[id]/payout/tempo/verify/route.ts](src/app/api/droplinks/[id]/payout/tempo/verify/route.ts) verifies Tempo payout proof.
- [src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts](src/app/api/droplinks/[id]/payout/stripe-connect/start/route.ts) starts Stripe Connect onboarding.

Public and admin UI:

- [src/components/LandingFlow.tsx](src/components/LandingFlow.tsx) powers the landing URL flow.
- [src/components/DroplinkExperience.tsx](src/components/DroplinkExperience.tsx) renders preview, generated, claimed, and live DropLink states.
- [src/components/DropProductCard.tsx](src/components/DropProductCard.tsx) renders each generated product.
- [src/app/directory/page.tsx](src/app/directory/page.tsx) lists generated droplinks.
- [src/components/AdminDropWorkflow.tsx](src/components/AdminDropWorkflow.tsx) drives admin generation and review.
- [src/components/AdminLiveConsole.tsx](src/components/AdminLiveConsole.tsx) shows generation state, logs, assets, relics, editions, and blockers.

## Runtime On Poiesis

This app runs locally on Poiesis behind a Cloudflare tunnel.

- Public URL: `https://droplink.lat`
- Local service URL: `http://127.0.0.1:3020`
- Web unit: `droplink-web.service`
- Tunnel unit: `cloudflared-droplink.service`

After app code changes, build and restart the managed service:

```bash
bun run build
systemctl --user restart droplink-web.service
systemctl --user status droplink-web.service --no-pager -l
curl -I http://127.0.0.1:3020/
```

Do not leave `next dev`, `bun run dev`, or other ad hoc servers running. Use the systemd service for the live local runtime.

## Local Development

Use Bun only. Do not use npm, pnpm, or yarn.

```bash
bun install
bun run dev
```

The development server defaults to `http://localhost:3000`, but this is not the tunneled Poiesis runtime. The live local service is `127.0.0.1:3020`.

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

AI and generation:

- `AI_PROVIDER`
- `IMAGE_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `HERMES_MODE`
- `HERMES_BRIDGE_URL`
- `HERMES_BRIDGE_TOKEN`
- `HERMES_AGENT_FALLBACK`

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

Storage:

- `STORAGE_PROVIDER`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Drop economics:

- `DROPLINK_SUMMON_PRICE_USDC=8`
- `DROPLINK_CREATOR_BOUNTY_BPS=800`
- `DROPLINK_PROTOCOL_FEE_BPS=0`
- `DROPLINK_TOTAL_SUPPLY=24`
- `DROPLINK_RELICS_PER_DROP=3`
- `DROPLINK_EDITIONS_PER_RELIC=8`

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

## Contribution Rules

- Keep the finite-drop invariant intact.
- Do not reintroduce subscriptions, premium plans, weekly drops, carts, or infinite products.
- Do not hardcode Printful variants.
- Do not publish mocks.
- Do not fake payment, fulfillment, DNS ownership, or onchain settlement.
- Keep generated product descriptors flexible, but keep operational states and ids explicit.
- Add tests when changing canonicalization, checkout, economics, fulfillment, readiness, or webhook behavior.
- Run `bun run typecheck`, `bun test`, and `bun run build` before shipping code changes.
