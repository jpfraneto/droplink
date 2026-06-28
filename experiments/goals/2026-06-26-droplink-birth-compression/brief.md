# DropLink Birth Compression Study

## Goal

Study five mechanisms for compressing a public link into a complete DropLink birth bundle:

1. Brand distillation from public URL evidence.
2. Exactly 3 Printful-specific products.
3. Fixed product/variant/SKU choices for those products.
4. One print-ready image prompt per selected product.
5. One group image prompt where the 3 products appear together.

The purpose is not to immediately rewrite production code. The purpose is to identify implementable pipeline shapes that can be tested against the current codebase.

## Current Pipeline Baseline

Current production path lives mainly in:

- `src/lib/generateDrop.ts`
- `src/lib/hermesDropAgent.ts`
- `src/lib/printful.ts`
- `src/lib/imageProvider.ts`
- `src/lib/og.ts`

Current flow:

```text
submitted URL
  -> canonical root/domain identity
  -> public page scrape
  -> Hermes brand study JSON
  -> Hermes relic triptych plan JSON
  -> Hermes critique/refinement JSON
  -> deterministic Printful catalog product + variant selection
  -> prompt-generated print file per relic
  -> Printful mockup task when configured
  -> deterministic Sharp OG composite, with an OG prompt saved for manual mode
```

Important current limitation:

- The relic plan asks Hermes for `printful_product_key`, but final product/variant selection is still deterministic string scoring.
- `RelicFulfillmentSpec` stores Printful `catalogProductId` and `catalogVariantId`, but does not normalize/store a first-class SKU field. SKU can be present in raw variant snapshots, but it is not part of the stable app contract.
- The three-product group image prompt is already built and stored, but automated generation currently uses `sharp` composition rather than an image model.

## Evidence

Local verification from the previous scaffold:

```bash
bun run typecheck
bun test
```

Both passed. Test suite had 17 passing tests.

Hermes bridge attempts during this study:

- Long operational prompt to `https://hermes.anky.app/prompt`: no response after about 90 seconds, interrupted.
- Shorter prompt with a 45 second abort controller: aborted with `AbortError`.

No bearer token was saved in repository files.

## External API Notes

Official Printful docs describe a catalog of blank products and variants, with v2 mockup generation returning files for valid product/variant/style/placement combinations. Printful's API v2 order flow is also split into creating the order object and adding items separately. That aligns with the current `src/lib/printful.ts` implementation.

Sources:

- https://developers.printful.com/docs/
- https://developers.printful.com/docs/v2-beta/
- https://help.printful.com/hc/en-us/articles/10293184543260-What-should-I-know-about-Printful-s-API-v2

## Success Criteria For Experiments

An experiment mechanism is useful only if it can produce a validated bundle:

```text
BrandStudy
ProductTriad
3 x SelectedPrintfulVariant
3 x ProductPrintPrompt
1 x GroupProductPrompt
EvaluationReport
```

The bundle should be rejected if:

- Fewer or more than 3 products are selected.
- Any product lacks a catalog product id.
- Any product lacks a catalog variant id.
- SKU is missing when available in Printful variant metadata.
- The print prompt does not mention the selected product, placement, technique, and triptych role.
- The group prompt does not include all 3 product identities and the shared visual system.
- The outputs violate brand safety or Printful manufacturability.
