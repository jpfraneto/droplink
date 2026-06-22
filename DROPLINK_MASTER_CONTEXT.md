DropLink Master Context

0. Non-negotiable technical preference

This project uses Bun.

Do not use pnpm.

Do not use yarn.

Do not use npm scripts as the documented workflow unless absolutely unavoidable for compatibility with a specific package.

Use Bun commands everywhere:

bun install
bun dev
bun run build
bun start
bun test

If a tool needs an executable, prefer:

bunx <tool>

The repository should have:

bun.lock

Do not create:

pnpm-lock.yaml
package-lock.json
yarn.lock

The package.json scripts should be Bun-friendly.

Example:

{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  }
}

Commands should always be documented as:

bun run dev
bun run build
bun run start
bun run db:migrate

or simply:

bun dev

if the script supports it.

1. What DropLink is

DropLink is a simple viral commerce product:

paste any link. get a drop.

A user pastes a public URL. DropLink reads the public page, understands the brand / project / vibe, and generates a tiny storefront with exactly 3 products.

The output should always be:

A public drop page.
Exactly 3 generated products.
Product names, descriptions, prices, and mockup images.
A shareable OG metadata image that includes the brand and the 3 products.
A drop receipt explaining why these 3 products were chosen.
Stripe checkout in test mode for the hackathon demo.
A “claim/connect Stripe” path for the real business model.

The magic is the constraint:

every link becomes 3 products.

Do not turn this into a giant ecommerce platform. Do not overbuild dashboards. Do not make the user configure product catalogs. The first product experience is one input and one result.

The core user flow:

paste URL
  ↓
DropLink reads the page
  ↓
DropLink extracts brand/lore/aesthetic
  ↓
DropLink generates exactly 3 products
  ↓
DropLink creates product mockups
  ↓
DropLink creates a branded OG share image
  ↓
DropLink publishes a tiny storefront
  ↓
user shares the generated drop
2. Strategic context

This project started from the Hermes Agent Accelerated Business Hackathon presented by NVIDIA AI, Stripe, and Nous Research.

The hackathon is about agents that can earn, spend, and run real operations.

DropLink’s angle:

agents should not just chat about a business. they should create something buyable.

For the hackathon demo, DropLink should show two levels.

Level 1: the viral surface

A normal user pastes a public URL.

Example:

https://nousresearch.com

DropLink returns:

droplink.app/d/nous-research

The page has exactly 3 products, a branded share image, and checkout.

This is the public “wow” moment.

Level 2: the agent-native depth

A Hermes agent that already knows a project can use a DropLink skill.

The skill creates a structured Drop Capsule from the agent’s real project context.

Then DropLink turns that capsule into a storefront.

The point:

a public website knows the surface.
the agent working on the project knows the lore.
DropLink turns either one into commerce.

For the demo, we can show Anky’s Hermes agent using the DropLink skill, but DropLink itself must not be branded as Anky. DropLink is its own project.

Anky can be an example user. DropLink is the product.

3. Brand positioning

Name:

DropLink

Primary tagline:

paste any link. get a drop.

Secondary lines:

every link becomes three products.
turn internet meaning into merch.
your project already has lore. DropLink turns it into things people can buy.

Tone:

simple
memeable
commercial
fast
fun
practical
not sacred
not enterprise-y
not “AI governance”
not spiritually branded
not under the Anky umbrella

DropLink can be weird and profitable. It does not need to carry the full emotional weight of Anky.

4. Business model

DropLink makes money through sales.

Default model:

DropLink takes 8% of sales.

Implementation framing:

In test mode, show the 8% platform fee in the receipt/admin data.
In production, use Stripe Connect so the drop owner can connect their own Stripe account.
When a connected account is used, DropLink should collect an 8% application/platform fee when possible.
Codex must verify the latest official Stripe Connect + Checkout implementation details before wiring the final production version.
Do not overbuild subscriptions for the MVP.

Future monetization:

8% sales cut.
Paid publishing or premium regeneration.
Custom domain / remove DropLink branding.
Connect own Stripe account.
Agency / white-label mode later.

For MVP, focus on:

generate preview → publish/claim → checkout → 8% fee model
5. Very important legal / safety / product guardrail

Anyone can paste any public link. That means someone can paste Stripe, NVIDIA, Nike, Apple, a random creator, a government website, etc.

This is powerful but legally risky.

So the MVP must distinguish between:

Preview drops

Generated from any public URL. Shareable. Clearly labeled as generated/unofficial.

Preview drops can have a storefront-style page and product mockups.

Live sellable drops

Require ownership/claim/approval before real live checkout.

For the hackathon, Stripe test mode checkout is fine.

For real production, do not enable live sales for a third-party brand unless the drop has been claimed/approved by the brand/project owner or the user has sufficient rights.

Copy guardrail:

Generated by DropLink from public web content. Not affiliated with the source unless claimed by the owner.

Product guardrail:

Avoid using exact trademarked logos unless the source owner has claimed the drop.
Prefer inspired visual systems over counterfeit logo merch.
Avoid copyrighted characters, celebrity likenesses, regulated goods, weapons, adult products, medical claims, political persuasion merch, hateful content, or anything that could obviously create legal/platform risk.
A public URL should never cause DropLink to scrape private/logged-in content.
Only fetch public HTTP/HTTPS pages.
Reject localhost, private IPs, internal networks, file URLs, and unsafe schemes.

This guardrail matters. The viral loop is the generated share card and preview page. The money loop happens when the owner claims/publishes/connects Stripe.

6. Product requirements
6.1 Landing page

Route:

/

The page should have:

Big headline: paste any link. get a drop.
URL input.
Generate button.
Example placeholders:
https://nousresearch.com
https://stripe.com
https://nvidia.com
https://anky.app
https://yourstartup.com
Small explanation:
DropLink turns any public URL into a tiny storefront with 3 generated products.
Demo gallery with previous generated drops if available.

The input should validate:

Must be URL.
Must be http or https.
Normalize URL.
Reject unsafe/local/private URLs.
6.2 Generation page / status

After submission:

/generate?job=...

or redirect to a status route:

/jobs/[jobId]

Show staged progress:

reading the link...
extracting the brand...
finding the lore...
choosing 3 products...
generating mockups...
building the storefront...
creating the share image...

The generation can be synchronous for MVP, but the UI should feel like a job.

If the generation fails, show a useful error and allow retry.

6.3 Drop page

Route:

/d/[slug]

This is the public storefront.

Must include:

Brand/project name.
Source URL.
Collection/drop name.
Hero section.
Exactly 3 products.
Product images/mockups.
Product prices.
Product descriptions.
“Generated by DropLink” badge.
“Share this drop” button.
Drop receipt section.
Claim/connect CTA.

For unclaimed preview drops:

Checkout button can use Stripe test mode for demo or be disabled in production.
Show a label:
Preview drop
Not affiliated unless claimed by owner

For claimed drops:

Checkout enabled.
Optional connected Stripe account.
6.4 Product page

Route:

/d/[slug]/p/[productSlug]

Must include:

Product image.
Name.
Price.
Description.
Why it belongs in the drop.
Checkout button.
Back to full drop.
6.5 OG metadata image

This is essential. This is the viral loop.

Every drop must have an OG image that renders well on Twitter/X, Farcaster, Discord, Slack, iMessage, etc.

The OG image should include:

DropLink branding.
Source brand/project name.
Collection/drop name.
The 3 product mockups.
Short phrase:
this link became a drop
or paste any link. get a drop.
Source URL/domain.
generated by DropLink

Important implementation guardrail:

Do not rely on AI to render all text accurately. AI image models often fail text. Instead:

Use AI to generate product visuals/mockups and possibly background texture.
Use programmatic rendering for the OG card text, layout, and product names.
Use Satori, sharp, canvas, or an equivalent server-side image composition system.
Store the final OG image as a PNG asset and use it in metadata.

Suggested route:

/api/og/[dropId].png

or store a generated PNG at:

/public/generated/og/[dropId].png

The route/page metadata for /d/[slug] should point to this OG image.

6.6 Drop receipt

Each drop should have a visible receipt.

The receipt explains:

Source URL.
What DropLink understood.
Brand summary.
Audience.
Why these 3 products.
Pricing logic.
Whether the drop is preview/claimed/live.
Revenue split:
DropLink platform fee: 8%
Generated timestamp.
Receipt hash.

This is not meant to be heavy. It should feel like provenance.

Example visible receipt:

Drop Receipt

Source: nousresearch.com
Collection: The Open Operator Drop

What DropLink saw:
An open AI research lab focused on agents, reasoning, and self-improving systems.

Why these products:
The drop turns the project’s agent-native identity into three physical objects: a hoodie for builders, a cap for operators, and a poster for the lore.

Platform fee:
DropLink takes 8% of sales.

Status:
Preview / Unclaimed
7. Technical architecture

Build a clean, fast MVP.

Recommended stack:

TypeScript.
Bun.
Next.js App Router or similar modern full-stack TypeScript framework.
Tailwind CSS for UI.
PostgreSQL.
Drizzle ORM preferred for lightweight Bun-friendly development, but Prisma is acceptable if Codex determines it is more reliable locally.
Stripe Checkout in test mode.
Stripe webhooks.
Railway deployment.
Environment variables documented clearly.
A provider abstraction for LLM/image generation so the app can work with real APIs or deterministic fallbacks.

Do not overbuild microservices. One web app is enough for MVP.

Recommended repo structure:

droplink/
  README.md
  DROPLINK_MASTER_CONTEXT.md
  package.json
  bun.lock
  .env.example
  railway.json
  src/
    app/
      page.tsx
      generate/
      jobs/
      d/
        [slug]/
          page.tsx
          p/
            [productSlug]/
              page.tsx
      api/
        drops/
          from-url/
            route.ts
          from-capsule/
            route.ts
          [id]/
            route.ts
        jobs/
          [id]/
            route.ts
        stripe/
          checkout/
            route.ts
          webhook/
            route.ts
        og/
          [dropId]/
            route.ts
    components/
      UrlInput.tsx
      DropCard.tsx
      ProductGrid.tsx
      ProductCard.tsx
      DropReceipt.tsx
      ShareCardPreview.tsx
      ClaimBanner.tsx
    lib/
      db.ts
      schema.ts
      urls.ts
      scrape.ts
      ai.ts
      generateDrop.ts
      productCatalog.ts
      imagePrompts.ts
      og.ts
      stripe.ts
      hashes.ts
      safety.ts
      slugs.ts
    styles/
  drizzle/
    migrations/
  skills/
    droplink/
      SKILL.md
      capsule.schema.json
      example-capsule.json

If using Drizzle:

src/lib/schema.ts
drizzle.config.ts

If using Prisma:

prisma/schema.prisma

But default preference is Drizzle unless there is a strong reason not to.

8. Data model

Minimum entities:

Drop

Represents one generated storefront.

Fields:

id
slug
sourceUrl
sourceDomain
sourceTitle
sourceDescription
brandName
brandSummary
audience
collectionName
collectionTagline
status: generating | preview | claimed | live | failed
isClaimed
ownerEmail nullable
stripeConnectedAccountId nullable
platformFeeBps default 800
receiptJson
receiptHash
capsuleJson nullable
capsuleHash nullable
ogImageUrl nullable
createdAt
updatedAt
publishedAt nullable
Product

Exactly 3 per drop.

Fields:

id
dropId
slug
name
type
description
whyThisProduct
priceCents
currency default usd
imagePrompt
imageUrl nullable
mockupUrl nullable
stripeProductId nullable
stripePriceId nullable
position 1..3
createdAt
updatedAt
GenerationJob

Tracks URL/capsule generation.

Fields:

id
type: from_url | from_capsule
status: queued | running | completed | failed
inputJson
logsJson
error nullable
dropId nullable
createdAt
updatedAt
Order

Tracks Stripe orders.

Fields:

id
dropId
productId nullable
stripeCheckoutSessionId
stripePaymentIntentId nullable
amountSubtotalCents
amountTotalCents
platformFeeCents
currency
status: pending | paid | refunded | failed
customerEmail nullable
fulfillmentStatus: none | pending | fulfilled | cancelled
createdAt
updatedAt
Claim

Optional MVP entity.

Fields:

id
dropId
email
status: pending | verified | rejected
verificationMethod
createdAt
updatedAt
DropCapsule

Can be stored inside Drop as capsuleJson, or separate table.

Fields:

id
dropId nullable
source
capsuleJson
capsuleHash
createdByAgent nullable
createdAt
9. The Drop Capsule protocol

This is the simple protocol/resiliency layer.

A Drop Capsule is a portable JSON object that describes a project drop before it becomes a storefront.

It can come from:

Public URL extraction.
A Hermes agent skill.
A human/API later.

The schema should be stored as:

skills/droplink/capsule.schema.json

Example:

{
  "protocol": "droplink.drop_capsule",
  "version": "0.1",
  "source": {
    "type": "url",
    "url": "https://example.com",
    "domain": "example.com",
    "title": "Example"
  },
  "project": {
    "name": "Example",
    "one_liner": "What this project is in one sentence.",
    "brand_summary": "What DropLink or the agent understands about the project.",
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

Invariants:

Capsule must produce exactly 3 products.
Capsule must not include private secrets.
Capsule must mark whether source is public or agent-provided.
Capsule must be hashable.
The hash should be deterministic using stable JSON serialization.

Possible file extension later:

.droplink.json

For now, just use JSON.

10. Generation pipeline

Main function:

generateDropFromUrl(url)

Steps:

1. Validate URL.
2. Fetch public page safely.
3. Extract metadata, title, description, text, images, favicon, OG tags.
4. Create brand/project summary.
5. Generate Drop Capsule.
6. Validate capsule.
7. Ensure exactly 3 products.
8. Create Drop record.
9. Create 3 Product records.
10. Generate product images/mockups.
11. Generate/programmatically compose OG image.
12. Create Stripe test products/prices if Stripe is configured.
13. Mark Drop as preview.
14. Return public URL.

For deep mode:

generateDropFromCapsule(capsule)

Steps:

1. Validate capsule schema.
2. Safety scan capsule.
3. Ensure exactly 3 products.
4. Create Drop record.
5. Create Product records.
6. Generate images/mockups.
7. Compose OG image.
8. Create Stripe test products/prices if configured.
9. Mark Drop as preview or live depending on claim/approval.
10. Return public URL.
11. URL fetching and scraping guardrails

Implement src/lib/urls.ts and src/lib/scrape.ts.

Rules:

Accept only http:// and https://.
Normalize URLs.
Follow redirects carefully.
Reject:
localhost
127.0.0.1
0.0.0.0
private IP ranges
link-local IP ranges
internal hostnames
file URLs
ftp URLs
data URLs
Timeout fetches.
Limit response size.
Use a clear user agent.
Do not execute arbitrary scripts.
Do not require browser automation for MVP.
Use HTML parsing to extract:
title
meta description
OpenGraph title/description/image
favicon
visible text
headings
canonical URL

Suggested libraries:

cheerio
jsdom
@mozilla/readability if useful

Avoid Playwright unless absolutely necessary, because it increases deployment complexity on Railway.

12. AI generation design

Implement src/lib/ai.ts as a provider abstraction.

The app should support:

real provider configured by env
fallback/mock provider when no keys are available

This is important so the app can build and demo even if API keys are missing.

Environment variables:

AI_PROVIDER=openai | anthropic | local | mock
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
IMAGE_PROVIDER=openai | replicate | fal | mock
IMAGE_API_KEY=

Codex can choose the fastest working implementation.

Brand extraction prompt

Input:

URL
title
meta description
visible text sample
OG image info
domain

Output JSON:

{
  "brand_name": "...",
  "one_liner": "...",
  "brand_summary": "...",
  "audience": "...",
  "voice": ["...", "..."],
  "visual_direction": "...",
  "forbidden_vibes": ["...", "..."],
  "confidence": 0.82
}
Product generation prompt

Input:

brand extraction
product catalog
guardrails

Output:

exactly 3 products

Rules:

The 3 products should feel specific to the source, not generic.
Product names should be memeable and shareable.
Avoid direct unauthorized logos unless claimed.
Prefer “inspired by the project” over counterfeit branded merch.
Generate product types from the allowed catalog.
Always output exactly 3.
Allowed product catalog for MVP

Use simple product types:

t-shirt
hoodie
poster
cap
tote
sticker pack
mug

Default product mix if uncertain:

t-shirt
hoodie
poster

Suggested price defaults:

t-shirt: $44
hoodie: $68
poster: $28
cap: $32
tote: $26
sticker pack: $12
mug: $22

Prices can be adjusted but must be plausible.

Product image generation

Each product should get an image/mockup.

Important:

For MVP, image can be a clean mockup-style image rather than a perfect production-ready asset.
If using an image model, generate a product mockup with the product visible against a simple branded background.
Avoid depending on AI to render small text perfectly.
Product names can be overlaid programmatically if needed.
Store image URLs.

Fallback mode:

If no image provider key exists, create placeholder images programmatically with gradients, product type, product name, and brand colors.

The fallback must still make the demo usable.

13. OG image composition

Implement src/lib/og.ts.

The OG image should be deterministic and readable.

Recommended approach:

Use the 3 product images/mockups.
Programmatically compose them into a 1200x630 PNG.
Render text with server-side image generation:
DropLink logo/name.
this link became a drop
brand name
collection name
product names
domain
Save PNG to storage or serve from route.

Possible tools:

satori
sharp
canvas

Since we are deploying on Railway, make sure the selected approach works in a Node/Railway environment.

Do not assume Vercel-specific behavior.

14. Stripe integration

Stripe is central because the hackathon includes Stripe and because “connect your own Stripe” is a strong product reason.

MVP Stripe requirements:

Stripe Checkout in test mode.
Create product/price records or use dynamic line items.
Stripe webhook endpoint.
Order table updated on successful checkout.
Platform fee calculation stored in DB.
Clear .env.example.

Environment variables:

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
DROPLINK_PLATFORM_FEE_BPS=800

Checkout behavior:

On product page, user clicks checkout.
Server creates Stripe Checkout Session.
Redirect to Stripe Checkout.
On success, redirect to:
/d/[slug]?success=1
On cancel, redirect to:
/d/[slug]?cancelled=1
Webhook records paid order.

For the MVP, use test mode.

Stripe Connect / own Stripe account

This is very important for the product, even if MVP implementation is partial.

The product story:

connect your own Stripe and sell the drop from your own account while DropLink takes 8%.

Build the database fields and UI placeholder for this even if full Connect OAuth is not finished.

If time allows, implement Stripe Connect onboarding:

Create connected account or OAuth connection.
Store stripeConnectedAccountId.
Use Checkout with connected account / application fee.
Use 8% platform fee.

Codex must verify latest official Stripe Connect docs before implementing final charge flow. Do not guess deprecated API behavior.

If Connect is not completed by demo time, include:

“Connect Stripe” button placeholder.
Clear TODO in code.
Platform/test checkout working.
DB ready for connected accounts.
15. Fulfillment

DropLink ultimately sells IRL things, but for hackathon MVP do not overbuild fulfillment.

MVP:

Product is purchasable in Stripe test mode.
Order is recorded.
Fulfillment status is pending.
Admin/receipt shows fulfillment adapter is pending.

Future adapters:

Printful
Printify
Gelato
manual fulfillment

Create an interface:

interface FulfillmentProvider {
  createProduct(...)
  createOrder(...)
  getOrderStatus(...)
}

But do not block MVP on actual fulfillment integration.

The demo can say:

Checkout and order capture are live in Stripe test mode. Fulfillment is adapter-based and ready for POD integration.

16. Claiming drops

Because anyone can generate a drop from any URL, live selling should require claim/approval.

MVP claim flow can be simple:

On drop page, show:
Own this project? Claim this drop.
Collect email.
Store claim request.
Optionally verify email domain matches source domain.
If email domain matches source domain, mark as pending_verified or verified.
Let verified owner connect Stripe later.

Do not overbuild auth.

A simple magic-link auth can be future work.

For demo, claim flow can be minimal.

17. Agent-native mode

The deeper mode is key for the hackathon.

Build a skill directory:

skills/droplink/SKILL.md
skills/droplink/capsule.schema.json
skills/droplink/example-capsule.json

The skill lets a Hermes agent generate a Drop Capsule from project context.

The skill should instruct the agent:

Identify the project it is helping with.
Extract public-safe lore.
Do not include secrets.
Do not include private user data.
Do not publish automatically.
Produce exactly 3 products.
Produce a Drop Capsule JSON.
Ask for human approval before submitting if sensitive.
Submit to DropLink API if DROPLINK_API_URL and DROPLINK_API_KEY are configured.

Suggested skill content:

# DropLink Skill

Use this skill when the user wants to turn a project, company, repo, app, token, community, creator, or URL into a DropLink storefront.

Your job is not to create the storefront directly. Your job is to create a Drop Capsule.

A Drop Capsule is a public-safe JSON object that describes the project lore, audience, visual direction, and exactly 3 products.

Never include secrets, credentials, private documents, private user data, unreleased strategy, or anything the user has not approved for publication.

If the source is a public URL, include the URL.
If the source is private project context, summarize only what is safe to publish.

The capsule must include exactly 3 products.

After creating the capsule, show it to the user for approval.
If the user approves and DROPLINK_API_URL is configured, submit it to POST /api/drops/from-capsule.

API endpoint:

POST /api/drops/from-capsule

Accept:

{
  "capsule": { "...": "..." },
  "source": "hermes",
  "agent": {
    "name": "anky-hermes-agent",
    "version": "0.1"
  }
}

Return:

{
  "drop_id": "...",
  "slug": "...",
  "url": "https://..."
}

For demo:

Show the normal URL version first.
Then show the Anky/Hermes agent using the DropLink skill to generate a deeper capsule.
The brand remains DropLink.
18. API endpoints

Minimum API:

Create from URL
POST /api/drops/from-url

Request:

{
  "url": "https://example.com"
}

Response:

{
  "jobId": "...",
  "dropId": "...",
  "status": "preview",
  "url": "/d/example"
}

This can either return immediately after generation or return a job ID to poll.

Get job
GET /api/jobs/[id]

Response:

{
  "id": "...",
  "status": "running",
  "logs": ["reading the link...", "creating products..."],
  "dropId": null,
  "url": null,
  "error": null
}
Create from capsule
POST /api/drops/from-capsule

Request:

{
  "capsule": { "...": "..." }
}

Response:

{
  "dropId": "...",
  "slug": "...",
  "url": "/d/example"
}
Checkout
POST /api/stripe/checkout

Request:

{
  "dropId": "...",
  "productId": "..."
}

Response:

{
  "url": "https://checkout.stripe.com/..."
}
Stripe webhook
POST /api/stripe/webhook

Must verify Stripe signature.

OG image
GET /api/og/[dropId].png

Returns PNG.

19. UI design

The UI should be clean, fast, and slightly meme-native.

No need for overdesigned enterprise UI.

Visual direction:

White / off-white background.
Black text.
One bright accent color.
Cards with product images.
Big simple type.
Shareable output first.

Home page should feel like:

DropLink

paste any link. get a drop.

[ https://yourthing.com                  ] [generate]

Every link becomes 3 products.

Drop page should feel like a tiny modern storefront.

Product cards:

[image]

The Open Operator Hoodie
$68
For builders who let agents cook.

[Buy]

Drop receipt should be visible but not dominant.

20. Copy examples

Use these as defaults.

paste any link. get a drop.
every link becomes three products.
this link became a drop.
generated by DropLink.
Own this project? Claim the drop and connect your Stripe.
DropLink takes 8% of sales. The rest belongs to the drop owner after costs and Stripe fees.
Preview drop. Not affiliated with the source unless claimed by owner.
21. Demo scenario

The final demo video should show:

Demo 1: URL to storefront
Open DropLink.
Paste https://nousresearch.com or another hackathon-relevant public URL.
Click generate.
Show progress.
Show drop page with exactly 3 products.
Show OG/share card.
Click product.
Start Stripe test checkout.
Return to drop receipt.
Show platform fee: 8%.

Possible generated products for Nous:

The Open Operator Hoodie
The Hermes Skill Cap
The Self-Improving Systems Poster

Do not use actual logos without permission unless clearly demo/test/preview.

Demo 2: Agent-native capsule
Show Hermes/Anky agent context.
Run DropLink skill.
Agent outputs Drop Capsule.
Submit capsule to DropLink.
DropLink generates deeper storefront.
Explain:
“A public URL gives the surface.”
“An agent that knows the project gives the lore.”

Closing line:

DropLink turns any URL — or any agent’s understanding of a project — into a storefront people can buy from.
22. Railway deployment

The user has Railway CLI installed.

Codex should:

Add a clear README.md.
Add .env.example.
Ensure app runs locally with Bun.
Add PostgreSQL config.
Add Railway deployment notes.
Use Railway CLI if appropriate.

Commands should be documented as Bun commands:

bun install
bun dev
bun run build
bun start

Railway:

railway login
railway init
railway add
railway up

Codex should inspect the local environment and use the correct Railway workflow. Do not assume the project is already linked.

If Railway Postgres is used, document:

DATABASE_URL

Migrations:

bun run db:migrate

or framework-specific equivalent.

Important:

The app must run locally before Railway deployment.
If Railway build needs special Bun configuration, add the required railway.json, Nixpacks config, or Dockerfile.
Prefer the simplest Railway-compatible setup.
Do not silently switch to pnpm/npm just because Railway defaulted to it. Configure Railway to use Bun.
23. Environment variables

Create .env.example:

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
DROPLINK_API_KEY=dev_local_key

# Database
DATABASE_URL=

# AI
AI_PROVIDER=mock
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Images
IMAGE_PROVIDER=mock
IMAGE_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
DROPLINK_PLATFORM_FEE_BPS=800

# Optional Stripe Connect
STRIPE_CONNECT_CLIENT_ID=

The app must work in mock mode.

24. Mock mode requirements

Mock mode is not optional. It is required for development resilience.

If no AI/image/Stripe keys are present:

URL parsing should still work.
Brand extraction can use deterministic heuristics.
Products should be generated from templates.
Product images should be placeholder cards.
OG image should still generate.
Checkout button can show “Stripe not configured” or create a fake test flow.

If Stripe test keys are present:

Real Stripe Checkout test mode should work.

This ensures Codex can build and run the project without getting blocked.

25. Acceptance criteria

The MVP is successful when:

bun install works.
bun dev starts the app.
bun run build succeeds.
Home page loads.
User can paste a public URL.
App validates URL and rejects unsafe URLs.
App generates a drop.
Drop page has exactly 3 products.
Each product has:
name
type
description
price
image/mockup
why this product
Drop page has receipt.
Drop page has shareable OG metadata.
OG image includes 3 product visuals and readable programmatic text.
Stripe test checkout works if Stripe env vars exist.
Stripe webhook records paid order.
DropLink platform fee is stored as 8%.
/api/drops/from-capsule works with example capsule.
skills/droplink/SKILL.md exists.
README explains local dev and Railway deploy using Bun.
App can be deployed to Railway.
No live third-party checkout is enabled for unclaimed drops.
The demo can be recorded in under 3 minutes.
No pnpm/yarn/npm lockfiles are created.
26. Things not to build yet

Do not build these unless the MVP is already complete:

Full auth system.
Complex admin dashboard.
Multi-product catalog editor.
Subscriptions.
Real POD fulfillment.
Full Stripe Connect production flow if time is tight.
Marketplace discovery.
User profiles.
Team management.
Analytics dashboard.
Custom domains.
NFT/token functionality.
Anything Anky-branded as the main product.
27. Implementation order

Codex should build in this order.

Step 1: scaffold
Initialize TypeScript app using Bun.
Add Tailwind.
Add database ORM.
Add .env.example.
Add README skeleton.
Confirm no pnpm/yarn/npm lockfiles exist.
Step 2: data model
Implement Drop, Product, GenerationJob, Order.
Add migrations.
Add DB helpers.
Step 3: URL generation in mock mode
URL validation.
Scrape public metadata.
Generate mock capsule.
Create drop and 3 products.
Render drop page.
Step 4: product images and OG
Generate placeholder product cards.
Compose OG image.
Add metadata to drop page.
Step 5: AI provider
Add real AI provider if keys exist.
JSON output validation.
Fallback to mock provider.
Step 6: Stripe test checkout
Product checkout.
Webhook.
Order record.
8% fee calculation.
Step 7: capsule endpoint and skill
Add /api/drops/from-capsule.
Add skill docs.
Add example capsule.
Test capsule-generated drop.
Step 8: polish demo
Add demo URLs.
Add nice loading/progress UI.
Add share button.
Add claim/connect Stripe CTA.
Deploy to Railway.
28. Code quality guardrails
Use TypeScript strictly.
Use Bun.
Validate input with Zod or equivalent.
Keep generation logic in lib/generateDrop.ts.
Keep Stripe logic in lib/stripe.ts.
Keep scraping logic in lib/scrape.ts.
Keep URL safety in lib/urls.ts.
Keep prompts in dedicated files or constants.
Do not bury core logic inside React components.
Log generation steps in GenerationJob.logsJson.
Write code that can run without paid API keys.
Make errors readable.
Prefer shipping an end-to-end demo over perfect abstractions.
Do not introduce pnpm/yarn/npm lockfiles.
Do not document pnpm commands.
Do not switch away from Bun unless explicitly approved.
29. The essence

DropLink is not a generic store builder.

DropLink is not a merch dashboard.

DropLink is not Anky.

DropLink is:

paste any link. get a drop.

The product must preserve that simplicity.

The viral loop is the OG/share image:

this link became a drop
[3 generated products]
generated by DropLink

The money loop is:

claim the drop
connect your Stripe
sell products
DropLink takes 8%

The agent-native expansion is:

your agent already knows what you are building
DropLink skill turns that knowledge into a Drop Capsule
DropLink turns the capsule into a storefront

Build that.
