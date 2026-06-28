# Current State

Captured from the local workspace on 2026-06-25 before creating this experiment scaffold.

## Repository Shape

DropLink is a private Bun/Next.js 14 app with TypeScript, Drizzle migrations, a local JSON-store fallback, and a Railway worker.

Primary areas:

- `src/app/`: public, admin, API, claim, checkout, job, and legacy `/d/...` routes.
- `src/components/`: storefront, checkout, admin console, and product UI components.
- `src/lib/`: core domain logic for canonicalization, generation, storage, pricing, Printful, Stripe, DNS claims, economics, settlement, queues, and persistence.
- `drizzle/migrations/`: production database migrations.
- `skills/droplink/SKILL.md`: local operational notes for turning a public URL into a DropLink storefront.
- `data/`: ignored local JSON persistence.
- `output/` and `tmp/`: generated or scratch artifacts.

## Product Mechanism

The checked-in README and master context describe one root domain mapping to one finite DropLink:

- One canonical root/registrable domain per DropLink.
- A DropLink has 3 relics and 8 editions per relic.
- Total supply is 24.
- Drops move through `summoned`, `claimed`, `published`, `sold_out`, and `archived`.
- DNS TXT ownership proof gates claim.
- Stripe handles checkout; Printful receives draft orders while `PRINTFUL_CONFIRM_ORDERS=false`.
- x402/stablecoin payment is intended for new summons.

The local skill file uses newer storefront/collection language:

- Public storefront URLs are `/${brandSlug}`, not `/d/${brandSlug}`.
- Free/genesis creates 3 relics.
- Premium/atelier weekly collections create 8 relics.
- Admin generation starts through `POST /api/admin/generate`.

Treat this as an active context difference when designing experiments. Tests currently cover the root-domain finite-drop model.

## Verified Baseline

Commands run successfully:

```bash
bun run typecheck
bun test
```

Test result:

- 17 passing tests across `src/lib/atelier.test.ts`.
- Coverage is focused on canonicalization, DNS claim/payout proof, Printful metadata, pricing/readiness/checkout, and projected versus settled economics.

## Useful Entry Points

- App dev server: `bun run dev`
- Worker: `bun run worker`
- Typecheck: `bun run typecheck`
- Tests: `bun test`
- Admin generation: `POST /api/admin/generate`
- Job polling: `GET /api/jobs/:jobId`
- Public storefront route: `/:brandSlug`
- Legacy drop routes still present: `/d/:slug` and `/d/:slug/p/:productSlug`

## Experiment Guardrails

- Do not put generated blobs, logs, screenshots, or local store dumps in app directories.
- Keep public URL experiments public-data only.
- Do not publish automatically; preserve admin review.
- Prefer small fixtures and reproducible scripts over one-off manual notes.
- Record the command, environment assumptions, input URL, resulting job/drop/storefront ids, and observed failure modes for every run.
