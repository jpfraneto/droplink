# Implemented Evolution

This pass moved the production pipeline toward the rabbit-hole discovery model.

## New Runtime Shape

```text
submitted URL
  -> canonical root/domain identity
  -> source crawl
  -> brand discovery from page links/images/headings
  -> brand dossier
  -> Hermes brand study from dossier
  -> Hermes relic plan
  -> Hermes critique/refinement
  -> deterministic Printful product/variant matching
  -> print-ready artwork prompt/image per relic
  -> product-in-use lifestyle prompt/image per relic
  -> OG prompt/composite using the three lifestyle images first
```

## New Debug Stages

```text
DISCOVERING_BRAND
BRAND_DISCOVERED
BUILDING_DOSSIER
DOSSIER_READY
GENERATING_LIFESTYLE_IMAGES
LIFESTYLE_IMAGES_READY
```

These are now part of `GenerationStep`, so the admin/live console can show where the birth process is.

## Discovery Dossier

The first dossier pass collects:

- headings,
- repeated phrases,
- social/same-as/blog/docs/community/source links,
- ranked visual evidence from OG image, favicon, and page images,
- blocked social/community URLs that were recorded but not fetched yet.

The dossier is passed into Hermes during `study_brand`, and the top visual references are attached to product prompt metadata for admin/debug use.

## Lifestyle Images

Each relic now gets two image-generation prompts:

1. print-ready product artwork,
2. product-in-use lifestyle image showing someone wearing, carrying, holding, or using the selected product.

The lifestyle image is stored as an asset with:

```text
type = "lifestyle"
```

Readiness now requires valid lifestyle images before publish.

## OG Source Change

The OG generation prompt now asks for the three product-in-use images as primary references. The deterministic Sharp composite also uses lifestyle asset URLs first, falling back to existing mockups if needed.

## Remaining Gaps

- The crawler records social/community links but does not fetch and parse those pages yet.
- The image API path is still text-prompt based; it stores reference URLs in prompts, but does not yet send image inputs to a multimodal image-edit endpoint.
- The dossier is stored in event/asset metadata, not a first-class table.
- SKU is still not normalized as a first-class `RelicFulfillmentSpec.sku` field.
