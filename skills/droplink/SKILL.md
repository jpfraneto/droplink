# DropLink Skill

Use this skill when the user wants to turn a project, company, repo, app, token, community, creator, or URL into a DropLink storefront.

Your job is not to create the storefront directly. Your job is to create a Drop Capsule.

A Drop Capsule is a public-safe JSON object that describes the project lore, audience, visual direction, and exactly 3 products. DropLink turns the capsule into a storefront through `POST /api/drops/from-capsule`.

## Guardrails

- Never include secrets, credentials, API keys, private documents, private user data, unreleased strategy, or anything the user has not approved for publication.
- If the source is a public URL, include the URL.
- If the source is private project context, summarize only what is safe to publish.
- Do not publish automatically when the context is sensitive. Show the capsule to the user and ask for approval first.
- The capsule must include exactly 3 products.
- Avoid exact unauthorized logos, copyrighted characters, celebrity likenesses, regulated goods, weapons, adult products, medical claims, political persuasion merch, or hateful content.
- Prefer inspired visual systems over counterfeit logo merch.
- Default to `approval.status: "preview"` unless the user has clearly approved a claimed/live drop.

## Capsule Shape

Return valid JSON matching `capsule.schema.json`:

```json
{
  "protocol": "droplink.drop_capsule",
  "version": "0.1",
  "source": {
    "type": "agent",
    "url": "https://example.com",
    "domain": "example.com",
    "title": "Example"
  },
  "project": {
    "name": "Example",
    "one_liner": "What this project is in one sentence.",
    "brand_summary": "Public-safe project summary.",
    "audience": "Who this drop is for.",
    "voice": ["clear", "weird", "builder-native"],
    "forbidden_vibes": ["generic AI merch", "counterfeit logo merch"]
  },
  "drop": {
    "collection_name": "The Example Drop",
    "collection_tagline": "A short line for the collection.",
    "visual_direction": "What the product images should feel like.",
    "products": [
      {
        "name": "Product 1",
        "type": "t-shirt",
        "description": "Short product description.",
        "why_this_product": "Why this belongs in the drop.",
        "price_cents": 4400,
        "currency": "usd",
        "image_prompt": "Prompt for product mockup generation."
      },
      {
        "name": "Product 2",
        "type": "hoodie",
        "description": "Short product description.",
        "why_this_product": "Why this belongs in the drop.",
        "price_cents": 6800,
        "currency": "usd",
        "image_prompt": "Prompt for product mockup generation."
      },
      {
        "name": "Product 3",
        "type": "poster",
        "description": "Short product description.",
        "why_this_product": "Why this belongs in the drop.",
        "price_cents": 2800,
        "currency": "usd",
        "image_prompt": "Prompt for product mockup generation."
      }
    ]
  },
  "commerce": {
    "platform_fee_bps": 800,
    "requires_claim_for_live_sales": true
  },
  "approval": {
    "status": "preview",
    "approved_by": null
  }
}
```

## Submission

If the user approves and `DROPLINK_API_URL` is configured, submit:

```http
POST /api/drops/from-capsule
content-type: application/json
authorization: Bearer ${DROPLINK_API_KEY}
```

```json
{
  "capsule": { "...": "..." },
  "source": "hermes",
  "agent": {
    "name": "anky-hermes-agent",
    "version": "0.1"
  }
}
```

Expected response:

```json
{
  "drop_id": "drop_...",
  "slug": "example",
  "url": "/d/example"
}
```
