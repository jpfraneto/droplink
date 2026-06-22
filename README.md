# DropLink

paste any link. get a drop.

DropLink is a Bun-first TypeScript web app that turns a public URL, or an agent-generated Drop Capsule, into a tiny preview storefront with exactly 3 generated products, mockup images, a programmatic share image, a visible receipt, and Stripe test checkout when keys are configured.

## Local Development

```bash
bun install
bun dev
```

Open `http://localhost:3000`.

Required local commands:

```bash
bun run build
bun start
```

Do not use pnpm, yarn, or npm lockfiles for this project.

## Environment

Copy `.env.example` to `.env.local` and fill values as needed. The app works without AI, image, Stripe, or database keys:

- `AI_PROVIDER=mock` uses deterministic brand/product generation.
- `IMAGE_PROVIDER=mock` serves programmatic product images for development.
- Empty `STRIPE_SECRET_KEY` enables a fake test checkout that records an order locally.
- `DROPLINK_PLATFORM_FEE_BPS=800` records the 8% DropLink platform fee.
- `DROPLINK_REQUIRE_GENERATION_KEY=true` makes generation manual/admin-only. Send `Authorization: Bearer $DROPLINK_API_KEY` or `x-droplink-key`.

## API

- `POST /api/drops/from-url` with `{ "url": "https://example.com" }`
- `POST /api/drops/from-capsule` with `{ "capsule": { ... } }`
- `GET /api/jobs/:id`
- `POST /api/stripe/checkout` with `{ "dropId": "...", "productId": "..." }`
- `POST /api/stripe/webhook`
- `GET /api/og/:dropId.png`

## Agent-Native Path

The Hermes-compatible skill lives in `skills/droplink/SKILL.md`. It produces a valid Drop Capsule JSON that can be submitted to `POST /api/drops/from-capsule`.

```bash
curl -X POST http://localhost:3000/api/drops/from-capsule \
  -H "content-type: application/json" \
  --data @skills/droplink/example-capsule.json
```

## Railway

The repo includes `railway.json` configured for Bun:

```bash
railway login
railway init
railway up
```

Set at least:

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `DROPLINK_PLATFORM_FEE_BPS=800`

Optional for real Stripe test checkout:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

`DATABASE_URL` is documented for Railway Postgres. The current MVP uses local JSON persistence for a clean hackathon demo and can be upgraded behind the storage helpers in `src/lib/store.ts`.

Drizzle/Postgres schema and config are included:

```bash
bun run db:generate
bun run db:push
```
