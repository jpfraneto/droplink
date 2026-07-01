---
name: droplink
description: "Turn any public brand URL into a three-product merchandise concept with product strategy, visual direction, and ready-to-use image generation prompts for the product art and mockups."
version: 1.3.0
author: DropLink / Anky / Hermes Agent
metadata:
  hermes:
    tags: [brand-analysis, ecommerce, merchandise, product-design, image-prompts, print-on-demand, agentic-commerce]
---

# DropLink Skill

## What this is

DropLink is a method for turning a public URL into a small, coherent merchandise drop.

A "drop" means a limited set of physical products that all feel like they belong to the same brand world.

This skill is for agents and humans who want to answer this question:

> If this website, company, creator, project, protocol, restaurant, community, or product became three physical objects people could buy, what should those objects be, and what should the art on those objects look like?

The goal is not to paste a logo onto random merch.

The goal is to understand what the brand is actually bringing into the world, who the buyer becomes by owning it, and what three real objects would make that meaning physical.

This skill produces both strategy and creative execution:

- a clear interpretation of the brand
- the hidden world behind the brand
- the buyer identity or role
- the emotional contract the brand offers
- three product concepts
- visual/art direction for each product
- image generation prompts for the artwork that goes on each product
- optional reference-image requirements for better image generation
- product mockup prompts showing how the objects should appear
- buyer-facing product names and descriptions
- production notes for print-on-demand or manufacturing

## Why this is valuable

Most websites explain what something does.

This skill helps clarify what that thing means.

It gives people a new creative perspective on a brand, project, company, restaurant, protocol, creator, community, or product by asking:

- What world is this opening?
- What kind of person does this invite someone to become?
- What emotion or belief is it carrying?
- What physical objects would make that meaning visible?
- What art would make those objects feel real?

The output can be used for:

- merchandise ideation
- brand strategy
- creative direction
- image generation
- print-on-demand product creation
- pitch decks
- community drops
- creator products
- fan/scout concepts
- internal brand exploration

A person should be able to take the final output, copy the image prompts into an image model, provide any required references, and generate visual representations of the product art and product mockups.

## The core idea

Every DropLink has three objects:

1. WEAR
   Something worn in public.
   It expresses identity.
   Example vessels: t-shirt, hoodie, hat, tote.

2. USE
   Something touched or used in daily life.
   It creates ritual.
   Example vessels: mug, notebook, bottle, bag, desk mat.

3. DISPLAY
   Something placed in a room, workspace, wall, shelf, or device.
   It expresses belief.
   Example vessels: poster, sticker, print, framed image, sign.

A good drop has exactly one of each.

Do not make three shirts.
Do not make three logo placements.
Do not make generic startup swag.

## Who should use this skill

Use this skill when you have:

- a website URL
- a brand name
- a social profile
- a product page
- a community page
- a startup homepage
- a crypto protocol page
- a creator page
- a local business website
- a campaign page

And you want to produce:

- a brand interpretation
- a merchandise concept
- three product ideas
- art prompts for those products
- mockup prompts for showing those products
- visual/art direction
- product names and descriptions
- production notes for print-on-demand or manufacturing

## What the agent must do

The agent must move through this process in order.

Do not skip straight to products.
Do not skip image prompts.

First understand the brand.
Then design the objects.
Then write the prompts that can generate the visual art and product representation.

## Process

### Step 1: Read the URL

Open or inspect the provided URL.
Collect public evidence only.

Look for:

- brand name
- page title
- description
- headings
- repeated phrases
- slogans
- product claims
- audience language
- visual style
- colors
- images
- icons
- typography clues
- screenshots
- social links
- founder/project language
- community signals
- pricing or product positioning

If the page cannot be fetched, use whatever public text or metadata is available and clearly say what was missing.

### Step 2: Separate surface from meaning

Write two short answers:

1. What is this brand literally?
   Example: "An AI research lab", "a coffee shop", "a crypto wallet", "a musician's website".

2. What is this brand emotionally or culturally?
   Example: "a place for people who want to feel early", "a tool for people who want control", "a world for people who turn obsession into craft".

The second answer matters more for product design.

### Step 3: Define the hidden world

The hidden world is the symbolic world behind the brand.

It is not a fantasy world unless the brand itself supports that.
It is the emotional territory the buyer enters when they identify with the brand.

Examples:

- A cybersecurity company might open a world of vigilance, locked doors, and quiet guardianship.
- A bakery might open a world of warmth, morning rituals, and inherited recipes.
- An AI lab might open a world of forbidden machinery, open research, and collective intelligence.
- A running club might open a world of discipline, sweat, sunrise, and shared suffering.

Write this in plain language.

### Step 4: Define the buyer role

The buyer role is who someone becomes by owning the object.

Do not use demographic language like:

- "tech workers"
- "Gen Z"
- "parents aged 25-40"
- "crypto users"

Instead use identity language:

- "the early signal keeper"
- "the quiet operator"
- "the morning loyalist"
- "the builder who refuses permission"
- "the person who was there before it became obvious"

The buyer role should make someone think:

> Yes, that is me.

### Step 5: Define the emotional contract

The emotional contract is the promise or tension the brand asks the buyer to live with.

Examples:

- "You protect what others overlook."
- "You were here before the crowd arrived."
- "You turn routine into devotion."
- "You choose depth over noise."
- "You carry the signal when no one else sees it yet."

This is the heart of the drop.

### Step 6: Define what NOT to make

List what would feel wrong, cheap, unsafe, or off-brand.

Examples:

- generic logo t-shirt
- fake official partnership language
- copyrighted characters
- celebrity likenesses
- exact slogans or marks if not authorized
- jokes that weaken the brand
- overly mystical language for practical brands
- overly corporate language for emotional brands

This step prevents bad merch.

### Step 7: Design exactly three objects

Create one object for each slot:

1. WEAR
2. USE
3. DISPLAY

For each object, define:

- product name
- physical vessel
- slot: WEAR, USE, or DISPLAY
- why this object exists
- what the buyer feels when owning it
- visual/art direction
- suggested print area
- suggested materials/colors
- short product description
- production notes

The object must be manufacturable.

Good:
- "heavyweight black tee with small chest mark and large back print"
- "ceramic mug with wraparound phrase and symbol"
- "matte poster with abstract map of the brand world"

Bad:
- "a portal shard of infinite memory"
- "a transcendent identity relic"
- "a hoodie, a hoodie, and another hoodie"

Symbolism is allowed, but the object must remain physically clear.

### Step 8: Create visual direction

Describe the art as if briefing a designer or image model.

Include:

- composition
- colors
- texture
- typography style
- symbols/motifs
- what must be avoided
- whether the design should feel clean, rough, technical, warm, luxurious, handmade, rebellious, etc.

Do not simply say "put the logo on it."

### Step 9: Generate image prompts for the product art

This is required.

For each product, write a prompt that can generate the artwork that will be printed, embroidered, engraved, or displayed on the object.

This is the art itself, not the product mockup.

For example:

- the graphic that goes on the back of a t-shirt
- the wraparound illustration for a mug
- the poster image
- the sticker design
- the notebook cover art
- the tote bag print

Each product art prompt must include:

- intended output: print art / poster art / sticker art / cover art / textile graphic, etc.
- composition
- subject matter
- symbols and motifs
- color palette
- texture/material feel
- typography instructions, if any
- background style, or transparent background if needed
- aspect ratio
- whether the image should include text
- what text should appear, if any
- what must not appear

Also include a negative prompt or avoid list.

Important:

- If the product requires a transparent-background graphic, say so.
- If the product requires a poster-style full-bleed image, say so.
- If text is not safe or image models may misspell it, say "no text in image" and put text in production notes instead.
- Do not include unauthorized logos, protected marks, celebrity likenesses, or exact copyrighted characters unless the user has rights.

### Step 10: Decide whether image references are needed

For each product, decide if the image model needs references.

References are optional. Do not require them by default.

Use references when the visual identity depends on:

- a specific color palette from the site
- a specific product photo
- a specific logo shape that the user owns or is authorized to use
- a specific founder/creator/person, only if rights are clear
- a specific location, interior, storefront, object, dish, or material
- a specific screenshot or interface style
- a specific existing mascot or character, only if rights are clear

For each product, state:

- references_required: true or false
- reference_type: logo / screenshot / product photo / color palette / founder image / location photo / none
- why_reference_is_needed
- what the user should provide
- how the image prompt should use the reference

If references are not required, say:

- references_required: false
- reference_type: none
- why_reference_is_needed: "The concept can be generated from the prompt alone."

### Step 11: Generate product mockup prompts

For each product, write a second prompt that can generate a visual representation of the finished physical product.

This is not the standalone artwork.
This is the product shown as an object.

Examples:

- a t-shirt mockup hanging on a wall
- a hoodie worn by a person without showing a recognizable face
- a mug on a desk in morning light
- a poster taped above a workstation
- a tote bag lying on concrete
- a sticker on a laptop

Each product mockup prompt must include:

- physical product vessel
- where the generated art appears on the product
- scene/environment
- lighting
- camera angle
- material realism
- mood
- whether people appear or not
- what must not appear

Avoid fake ecommerce clutter unless requested.
Do not use unauthorized logos or official claims.

### Step 12: Write public product copy

Write copy a buyer could actually see.

Rules:

- short
- physical
- specific
- desirable
- no internal process words
- no explaining the analysis

Avoid these words in public-facing copy:

- DropLink
- relic
- triptych
- SKU
- product key
- 1/3, 2/3, 3/3
- artifact, unless the brand really supports it

### Step 13: Return structured output

Return the final answer in clear sections or valid JSON.

If the user asks for JSON, return only JSON.

The output must include image prompts. A DropLink output without image prompts is incomplete.

## Recommended output format

Use this structure unless the user asks for something else:

```json
{
  "source_url": "https://example.com",
  "brand_name": "Example Brand",
  "literal_summary": "What the brand literally is.",
  "emotional_summary": "What the brand means culturally or emotionally.",
  "hidden_world": "The symbolic world behind the brand.",
  "buyer_role": "Who the buyer becomes by owning the objects.",
  "emotional_contract": "The promise or tension the buyer accepts.",
  "visual_dna": {
    "colors": ["color 1", "color 2"],
    "materials": ["material or texture"],
    "motifs": ["motif 1", "motif 2"],
    "typography": "Typography direction",
    "mood": "Overall visual mood"
  },
  "language_dna": {
    "phrases": ["repeated phrase or invented phrase"],
    "tone": "How the brand should sound",
    "words_to_avoid": ["word or phrase"]
  },
  "do_not_make": [
    "Thing that would feel wrong or unsafe"
  ],
  "collection": {
    "title": "Short collection title",
    "subtitle": "One-line subtitle",
    "concept": "How the three products work together"
  },
  "products": [
    {
      "slot": "WEAR",
      "name": "Product name",
      "physical_vessel": "T-shirt / hoodie / hat / tote / etc.",
      "buyer_feeling": "What the buyer feels when wearing it",
      "why_this_exists": "Why this object belongs in the drop",
      "visual_direction": "Designer/image-model brief",
      "print_direction": "Where and how the graphic appears",
      "colors_materials": "Suggested colors/materials",
      "public_description": "Short buyer-facing description",
      "production_notes": "Practical production notes",
      "image_generation": {
        "art_prompt": "Prompt for generating the standalone artwork that goes on the product.",
        "negative_prompt": "Things the image model must avoid.",
        "aspect_ratio": "Example: 1:1, 4:5, 3:4, 16:9, transparent PNG, full-bleed poster, etc.",
        "text_in_image": "none / exact text to include / avoid text because model may misspell",
        "references_required": false,
        "reference_type": "none / logo / screenshot / product photo / color palette / location photo / etc.",
        "why_reference_is_needed": "Why a reference is or is not needed.",
        "what_user_should_provide": "Specific reference files or none.",
        "mockup_prompt": "Prompt for generating an image of the finished physical product using the art direction."
      }
    },
    {
      "slot": "USE",
      "name": "Product name",
      "physical_vessel": "Mug / notebook / bottle / bag / etc.",
      "buyer_feeling": "What the buyer feels when using it",
      "why_this_exists": "Why this object belongs in the drop",
      "visual_direction": "Designer/image-model brief",
      "print_direction": "Where and how the graphic appears",
      "colors_materials": "Suggested colors/materials",
      "public_description": "Short buyer-facing description",
      "production_notes": "Practical production notes",
      "image_generation": {
        "art_prompt": "Prompt for generating the standalone artwork that goes on the product.",
        "negative_prompt": "Things the image model must avoid.",
        "aspect_ratio": "Example: 1:1, 4:5, 3:4, 16:9, transparent PNG, full-bleed poster, etc.",
        "text_in_image": "none / exact text to include / avoid text because model may misspell",
        "references_required": false,
        "reference_type": "none / logo / screenshot / product photo / color palette / location photo / etc.",
        "why_reference_is_needed": "Why a reference is or is not needed.",
        "what_user_should_provide": "Specific reference files or none.",
        "mockup_prompt": "Prompt for generating an image of the finished physical product using the art direction."
      }
    },
    {
      "slot": "DISPLAY",
      "name": "Product name",
      "physical_vessel": "Poster / sticker / print / sign / etc.",
      "buyer_feeling": "What the buyer feels when displaying it",
      "why_this_exists": "Why this object belongs in the drop",
      "visual_direction": "Designer/image-model brief",
      "print_direction": "Where and how the graphic appears",
      "colors_materials": "Suggested colors/materials",
      "public_description": "Short buyer-facing description",
      "production_notes": "Practical production notes",
      "image_generation": {
        "art_prompt": "Prompt for generating the standalone artwork that goes on the product.",
        "negative_prompt": "Things the image model must avoid.",
        "aspect_ratio": "Example: 1:1, 4:5, 3:4, 16:9, transparent PNG, full-bleed poster, etc.",
        "text_in_image": "none / exact text to include / avoid text because model may misspell",
        "references_required": false,
        "reference_type": "none / logo / screenshot / product photo / color palette / location photo / etc.",
        "why_reference_is_needed": "Why a reference is or is not needed.",
        "what_user_should_provide": "Specific reference files or none.",
        "mockup_prompt": "Prompt for generating an image of the finished physical product using the art direction."
      }
    }
  ],
  "overall_image_style": {
    "shared_visual_language": "What makes all three generated images feel connected.",
    "shared_negative_prompt": "Global things to avoid across all product art and mockups.",
    "recommended_models_or_modes": "Optional advice such as vector style, product photography, transparent background, poster art, etc."
  }
}
```

## Image prompt writing rules

A useful image prompt is concrete.

Bad prompt:

> Make a cool shirt design for this brand.

Good prompt:

> Standalone screen-print graphic for the back of a heavyweight black t-shirt, transparent background, monochrome bone-white linework, an abstract map of signal towers connected by thin hand-drawn paths, one small sun symbol at the center, rough risograph texture, no logos, no readable text, no people, no mockup, no shirt visible, centered composition, high contrast, print-ready vector-like edges.

The art prompt should generate the design.
The mockup prompt should generate the product wearing that design.

Keep them separate.

## Safety and rights rules

If the user does not own the brand or domain, treat the result as an unofficial scout concept.

Do not claim:

- official partnership
- endorsement
- licensing
- ownership
- permission

unless the user explicitly provides that permission.

Avoid:

- exact logos when unauthorized
- exact trademarks as the main artwork
- exact slogans if they are protected brand language
- copyrighted characters
- celebrity likenesses
- fake badges like "official", "certified", or "approved"

Instead, make abstract, brand-adjacent, interpretation-based designs.

Example:

Bad:
- "Official Nike AI Lab Hoodie" with a Nike swoosh.

Better:
- "A motion-study hoodie inspired by speed, training logs, and blacktop geometry" without using Nike marks.

## Quality checklist

Before finalizing, check:

- Did you understand the brand before designing products?
- Is there exactly one WEAR, one USE, and one DISPLAY object?
- Are the products physically manufacturable?
- Does each object have a different role?
- Would the buyer identity feel specific and desirable?
- Did you avoid generic logo merch?
- Did you avoid unauthorized official claims?
- Is the visual direction detailed enough for a designer or image model?
- Does every product include a standalone art prompt?
- Does every product include a mockup prompt?
- Did you say whether references are required for each product?
- Is the public copy short and sellable?
- Does the drop feel like one coherent world?

## Short version

Read the URL.
Understand the brand.
Find the hidden world.
Name the buyer role.
Define the emotional contract.
Design exactly three products:

- WEAR: identity in public
- USE: daily ritual
- DISPLAY: visible belief

For every product, also generate:

- standalone art prompt
- negative prompt
- reference requirements
- physical product mockup prompt

Make it specific, manufacturable, safe, desirable, and usable by a human with an image model.
