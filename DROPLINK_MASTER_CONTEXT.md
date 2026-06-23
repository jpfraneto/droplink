# DropLink Master Context

## Technical Preference

Use Bun commands only:

```bash
bun install
bun dev
bun run build
bun start
bun test
```

Do not introduce pnpm, npm, yarn, or their lockfiles.

## What DropLink Is

DropLink turns a public brand URL into a limited relic storefront.

It is not a merch generator and not a Shopify clone. It is a cosmic atelier with a warehouse integration: a person drops a link, DropLink studies the soul of that link, distills the brand into limited internet relics, creates a storefront, generates the OG image that makes people click, accepts payment through Stripe, and fulfills through Printful after payment succeeds.

## Vocabulary

- Brand: source identity from a URL/domain.
- Storefront: public commerce page for a brand.
- Collection: one generated drop/capsule inside a storefront.
- Relic: one sellable product inside a collection.
- Edition: one of the 8 available units of a relic.

## Hard Product Invariants

- Public storefront URLs are `/${brandSlug}`.
- `/d/${brandSlug}` exists only as a backwards-compatible redirect.
- `brandSlug` is generated from the submitted hostname by stripping protocol, `www.`, paths, query strings, hashes, and dots.
- Slug collisions use `slug-2`, `slug-3`, etc.
- Free storefronts get exactly one genesis collection.
- A free genesis collection has exactly 3 relics.
- Premium storefronts support weekly collections.
- A premium weekly collection has exactly 8 relics.
- Every relic has exactly one fixed purchasable variant.
- Every relic has exactly 8 editions.
- Every checkout buys exactly one edition of exactly one relic.
- Every relic can sell at most 8 times ever.
- Scarcity is enforced inside DropLink’s database/ledger, not by Printful.
- Stripe is payment only.
- Printful is fulfillment only.
- No cart, no size selectors, no color selectors, no quantity selectors.

Examples:

- `https://anky.app` -> `ankyapp`
- `https://fomo.family` -> `fomofamily`
- `https://nousresearch.com` -> `nousresearchcom`
- `https://shop.anky.app/path?x=1` -> `shopankyapp`

## Business Model

Free / Genesis:

- 1 brand storefront.
- 1 genesis collection.
- 3 relics.
- 8 editions per relic.
- 24 total possible sales.
- DropLink checkout.
- DropLink takes 8% commission.
- Storefront is claimable by DNS TXT.
- No custom domain.
- No weekly drops.

Premium / Atelier:

- $88/month architecture.
- 1 brand storefront.
- Weekly drop engine.
- 8 new relics per week.
- 8 editions per relic.
- 64 possible sales per week.
- 0% DropLink commission.
- Owner approval before publishing weekly drops.
- Schema/config supports Stripe subscriptions and Connect.

## Launch Workflow

Public users should not trigger expensive generation directly.

1. JP posts on X asking for startup/product/brand links.
2. JP manually selects links.
3. JP opens `/admin` and submits a selected URL.
4. Backend generates everything.
5. JP reviews output, logs, status, checklist, study, relic plan, mockups, OG image.
6. JP publishes the storefront.
7. JP replies with `https://droplink.lat/${brandSlug}`.
8. Brand owner can claim via DNS TXT.
9. People can buy immediately when storefront is live.

## Pipeline

URL -> queued generation job -> brand ingestion -> brand distillation -> collection/relic plan -> Printful catalog/variant matching -> print artwork generation -> R2 asset upload -> WebP derivative generation -> print-file validation -> Printful mockup generation -> OG image generation -> renderable storefront route -> admin review -> publish -> Stripe checkout -> Stripe webhook -> atomic edition sale -> Printful draft order -> optional Printful confirmation -> tracking/order status.

## Data And Storage

Postgres/Drizzle is the real runtime store when `DATABASE_URL` exists.

Redis/BullMQ is the execution queue for generation and worker processing. Postgres remains the source of truth for job state, status, events, scarcity, orders, and ledger entries.

Cloudflare R2 is production asset storage. Store original print-ready PNG files, WebP storefront previews, OG PNG, and OG WebP derivatives in R2. Postgres stores only metadata, URLs, checksums, dimensions, byte sizes, and storage keys. Do not store generated asset blobs in Postgres.

Local JSON is development-only. In `NODE_ENV=production`, missing `DATABASE_URL` fails loudly.

Core tables:

- brands
- storefronts
- collections
- relics
- relic_editions
- assets
- mockups
- og_images
- brand_snapshots
- brand_studies
- relic_plans
- claims
- checkout_sessions
- orders
- order_items can be added later if multi-item ever exists, but current checkout is one relic/edition.
- ledger_entries
- fulfillment_orders
- stripe_accounts
- subscriptions
- admin_reviews
- system_events
- printful_catalog_cache

## Observability

Server logs are JSON with levels `debug`, `info`, `warn`, `error`.

Every request gets an `x-request-id`.

Generation has a trace/run ID.

External API calls log provider, operation, start, completion/failure, duration, internal IDs, provider IDs when relevant, and sanitized error messages. Never log secrets, raw payment data, or full API keys.

Important lifecycle events are stored in `system_events`.

## Generation State Machine

Persist these states:

- INTAKE_CREATED
- CRAWLING
- CRAWLED
- DISTILLING
- DISTILLED
- PLANNING_RELICS
- RELICS_PLANNED
- MATCHING_PRINTFUL
- PRINTFUL_MATCHED
- GENERATING_PRINT_FILES
- PRINT_FILES_READY
- VALIDATING_PRINT_FILES
- PRINT_FILES_VALID
- GENERATING_MOCKUPS
- MOCKUPS_READY
- GENERATING_OG
- OG_READY
- READY_FOR_REVIEW
- PUBLISHED
- FAILED

## AI Rules

The cosmic/awe layer matters, but AI output must be structured and validated.

AI produces JSON only:

- `brand_study_json`
- `relic_plan_json`

Outputs are validated before anything touches Stripe or Printful. Prompt/model versions are stored.

## Checkout Rules

Checkout flow:

1. Buyer clicks `BUY RELIC`.
2. Server starts a transaction.
3. Server atomically finds one available edition for the relic.
4. Server reserves it for 30 minutes.
5. Server creates a Stripe Checkout Session.
6. Server stores checkout session row with relic_edition_id.
7. Stripe webhook confirms payment.
8. Server marks checkout completed.
9. Server marks edition sold.
10. Server creates order and ledger entries.
11. Server triggers Printful fulfillment.
12. Expired/failed checkout releases the edition.

Postgres reservation should use transaction-safe locking such as `FOR UPDATE SKIP LOCKED`.

## DNS Claim

TXT name:

```text
_droplink.${hostname}
```

TXT value:

```text
droplink-verify=${token}
```

If present, mark claim and storefront verified.

## Admin

Admin must support:

- submit URL
- list storefronts/collections
- inspect generation status
- inspect system events
- inspect brand study
- inspect relic plan
- inspect relics/products
- inspect mockups
- inspect OG image
- inspect readiness checklist
- publish
- manually mark premium
- view minimal order/ledger trail as it grows

Generation is gated by `DROPLINK_API_KEY` and `DROPLINK_REQUIRE_GENERATION_KEY=true`.

## Production Guardrails

If `NODE_ENV=production`:

- fail if `DATABASE_URL` is missing
- fail if Stripe keys are missing and commerce is enabled
- prevent publishing collections that are not checkout/fulfillment-ready unless explicitly preview/mock
- do not let mock checkout or mock fulfillment masquerade as production

## Current Implementation Notes

- Canonical storefront route is `/${brandSlug}`.
- Admin route is `/admin`.
- Migration path is `drizzle/migrations`.
- Tests live under `src/lib/*.test.ts`.
- Keep abstractions small and explicit. Simplicity wins.
