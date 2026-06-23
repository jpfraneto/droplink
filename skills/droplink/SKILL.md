# DropLink Skill

Use this skill when the user wants to turn a public brand URL into a DropLink storefront.

DropLink is no longer a merch-drop capsule demo. It is a cosmic atelier with a warehouse integration:

- Brand = source identity from a public URL/domain.
- Storefront = public commerce page for a brand.
- Collection = generated capsule/drop inside a storefront.
- Relic = one sellable product inside a collection.
- Edition = one of the 8 available units of a relic.

## Current Product Rules

- Public storefront URLs are `/${brandSlug}`, not `/d/${brandSlug}`.
- Free / Genesis creates exactly 3 relics.
- Premium / Atelier weekly collections create exactly 8 relics.
- Every relic has exactly one fixed variant.
- Every relic has exactly 8 editions.
- Every checkout buys exactly one edition of exactly one relic.
- No cart, no size selectors, no color selectors, no quantity selectors.
- Stripe is payment only.
- Printful is fulfillment only.
- DropLink owns scarcity, ledger, admin review, and claim flow.

## What This Skill Should Do

Prefer submitting or preparing a public URL for admin generation. Do not create legacy Drop Capsule JSON unless explicitly working with archived demo code.

Admin generation endpoint:

```http
POST /api/admin/generate
content-type: application/json
authorization: Bearer ${DROPLINK_API_KEY}
```

```json
{
  "url": "https://nousresearch.com",
  "tier": "free",
  "type": "genesis"
}
```

Expected response:

```json
{
  "jobId": "job_...",
  "traceId": "run_..."
}
```

Generation is processed asynchronously by BullMQ/Redis workers. Poll `/api/jobs/${jobId}` or open `/jobs/${jobId}`.

Public URL after admin publish:

```text
https://droplink.lat/nousresearchcom
```

## Safety

- Never include secrets, credentials, private documents, private user data, unreleased strategy, or anything not approved for publication.
- Use public URLs only.
- Avoid exact unauthorized logos, copyrighted characters, celebrity likenesses, regulated goods, weapons, adult products, medical claims, political persuasion merch, or hateful content.
- Prefer inspired visual systems over counterfeit logo merchandise.
- Do not publish automatically. Admin review must approve first.
