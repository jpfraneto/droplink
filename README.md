# DropLink

DropLink turns a public brand URL into a limited relic storefront.

It is a cosmic atelier with a warehouse integration: JP selects a public link, submits it through admin, DropLink studies the brand, creates one storefront, one collection, fixed relics, a mandatory OG image, Stripe Checkout, an edition ledger, and Printful fulfillment records.

## Product Invariants

- Public storefront URLs are `/${brandSlug}`. `/d/${brandSlug}` redirects for compatibility.
- `brandSlug` comes from the submitted hostname by removing protocol, `www.`, path, query, hash, and dots.
- Free / Genesis: 1 storefront, 1 genesis collection, exactly 3 relics.
- Premium / Atelier: $88/month architecture, weekly collections, exactly 8 relics per weekly collection.
- Every relic has exactly one fixed purchasable variant.
- Every relic has exactly 8 editions.
- Every checkout buys exactly one edition of exactly one relic.
- Scarcity is enforced in DropLink’s database, not Printful.
- Stripe is payment only. Printful is fulfillment only.
- No cart, no size selectors, no color selectors, no quantity selectors.

## Local Development

Use Bun only:

```bash
bun install
bun dev
bun run build
bun run check
bun start
bun test
bun run worker
```

Open `http://localhost:3000`.

Admin is at `/admin`. Set `DROPLINK_REQUIRE_GENERATION_KEY=true` and log in with `DROPLINK_API_KEY`.

## Runtime Storage And Queues

When `DATABASE_URL` exists, DropLink uses Postgres/Drizzle.

Local JSON is only a development fallback. In `NODE_ENV=production`, the app fails loudly when `DATABASE_URL` is missing.

Generation is queued through BullMQ on Redis. Postgres remains the source of truth for job status, events, scarcity, orders, and ledger entries.

Assets are stored in Cloudflare R2 in production. Print files are stored as PNG originals; storefront previews and OG page assets get WebP derivatives for faster loading. Postgres stores only metadata, URLs, checksums, dimensions, and storage keys.

```bash
bun run db:generate
bun run db:push
```

Migration files live in `drizzle/migrations`.

## Core Routes

- `GET /` public published storefront list.
- `GET /admin` internal admin review/generation page.
- `POST /api/admin/generate` admin-only URL intake; creates a persisted job and enqueues BullMQ work.
- `POST /api/admin/storefronts/:id/publish` admin publish after readiness checks.
- `POST /api/admin/storefronts/:id/premium` manual Atelier toggle.
- `GET /:brandSlug` public storefront.
- `GET /d/:brandSlug` compatibility redirect to `/:brandSlug`.
- `POST /api/stripe/checkout` with `{ "relicId": "..." }`.
- `POST /api/stripe/webhook` sells the reserved edition and starts fulfillment.
- `POST /api/claims/start` starts DNS TXT claim.
- `POST /api/claims/:id/check` checks DNS TXT claim.
- `POST /api/printful/webhook` persists Printful status/tracking events.

## Launch Workflow

1. JP opens `/admin`.
2. JP submits a selected URL, e.g. `https://nousresearch.com`.
3. DropLink creates a queued generation job.
4. Worker crawls, studies, plans, matches Printful, generates/validates files, uploads R2 assets, creates WebP derivatives, mockups, and OG.
5. Admin reviews the checklist, logs, study, plan, relics, and images.
6. Admin publishes.
7. Public URL is `https://droplink.lat/nousresearchcom`.
8. Buyer clicks `BUY RELIC`.
9. Backend atomically reserves one edition.
10. Stripe Checkout opens.
11. Stripe webhook marks the edition sold, writes ledger entries, and creates Printful fulfillment records.

## Environment

Copy `.env.example` to `.env.local`.

Important production values:

- `DATABASE_URL`
- `REDIS_URL`
- `DROPLINK_PUBLIC_BASE_URL`
- `DROPLINK_API_KEY`
- `DROPLINK_REQUIRE_GENERATION_KEY=true`
- `OPENAI_API_KEY` with `AI_PROVIDER=openai`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRINTFUL_API_KEY`
- `STORAGE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `ALLOW_MOCKS=false`

## Current Limitations

- Printful confirmation should remain disabled until one paid draft order is manually validated.
- R2 credentials must be configured before generation can produce publishable assets.
- Stripe subscription checkout and Connect onboarding are represented in schema/config and manual admin tiering; full owner billing/onboarding can be wired next without changing core scarcity.
- Shipping is intentionally narrow for first live testing.
