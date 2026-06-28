# Evaluation Plan

## Inputs

Use a small public URL set that covers different brand shapes:

```text
https://anky.app
https://nousresearch.com
https://tldraw.com
https://linear.app
https://www.raycast.com
```

These are public websites only. Do not include private documents, unreleased strategy, or secret customer data.

## Experiment Matrix

Run every mechanism against every URL.

```text
5 mechanisms x 5 URLs = 25 birth bundles
```

For each run, save:

```text
experiments/runs/<date>/<mechanism>/<domain>/birth-bundle.json
experiments/runs/<date>/<mechanism>/<domain>/prompts.md
experiments/runs/<date>/<mechanism>/<domain>/evaluation.json
```

Summaries go in:

```text
experiments/results/<date>-birth-compression-summary.md
```

## Metrics

Score each dimension from 1 to 5.

Brand fidelity:

- 1: generic merch that could belong to any brand.
- 3: reflects some source evidence.
- 5: feels specific while avoiding unsupported claims.

Triptych cohesion:

- 1: three unrelated products.
- 3: shared palette or motif.
- 5: each object has a distinct role in one coherent ritual/story.

Product contrast:

- 1: duplicate product types or roles.
- 3: some role difference.
- 5: clear body/carrier/witness or similarly meaningful spread.

Printful validity:

- 1: missing product/variant/placement.
- 3: resolves ids but weak placement/technique assumptions.
- 5: product, variant, placement, technique, and mockup/order-item request all validate.

SKU completeness:

- 1: no SKU captured.
- 3: SKU captured when obvious in raw variant data.
- 5: normalized SKU field plus raw snapshot retained for every selected variant where Printful provides one.

Print prompt readiness:

- 1: generic image prompt.
- 3: mentions brand and product.
- 5: includes product, variant, placement, technique, triptych role, visual DNA, negative constraints, and print-friendly composition.

Group prompt readiness:

- 1: vague launch image prompt.
- 3: mentions three products.
- 5: uses product references, preserves shared visual system, names all three objects, and forbids extra products/fake UI.

Safety:

- 1: copies logos/claims/likenesses unsafely.
- 3: generic safety language.
- 5: brand-specific avoid list plus explicit public-reference-only constraints.

## Automated Checks

Minimum checks for every birth bundle:

```text
exactly 3 selectedProducts
exactly 3 printPrompts
each selected product has catalogProductId, catalogVariantId, productName, variantName, placement, technique
each print prompt includes its productName, variantName, placement, technique
group prompt includes all 3 relic names and product names
all product/variant ids are unique unless the mechanism explicitly allows same product with different variant
no prompt asks for exact unauthorized logos, celebrities, weapons, adult products, medical claims, or political persuasion
```

## Manual Review Questions

For each generated bundle, ask:

1. Would a domain owner recognize this as a thoughtful interpretation of the public brand?
2. Would a buyer understand why only 24 objects exist?
3. Do the selected Printful products feel intentional rather than available-by-default?
4. Are the print prompts strong enough for a model to create sibling images without making them identical?
5. Does the group image prompt show the 3 products together rather than inventing new merchandise?

## Expected Winner

The most promising production pipeline is likely:

```text
Catalog-First Constraint
  + Archetype Lattice
  + Prompt Compiler
  + optional Critic-Ranked Beam
```

Reason:

- Catalog-first keeps Printful reality in the loop.
- Lattice keeps the 3-object ritual coherent.
- Prompt compiler makes output stable, testable, and diffable.
- Critic beam can improve quality once cost and caching are under control.
