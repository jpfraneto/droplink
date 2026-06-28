# Proposed Data Contract

This contract is intentionally stricter than the current production types. It is meant for experiment output and later production migration.

## Birth Bundle

```ts
export type BirthCompressionMechanism =
  | "symbolic_funnel"
  | "catalog_first_constraint"
  | "archetype_lattice"
  | "critic_ranked_beam"
  | "prompt_compiler";

export type DroplinkBirthExperiment = {
  id: string;
  mechanism: BirthCompressionMechanism;
  createdAt: string;
  source: SourceEvidence;
  brand: BrandDistillation;
  triad: ProductTriad;
  selectedProducts: [SelectedPrintfulProduct, SelectedPrintfulProduct, SelectedPrintfulProduct];
  printPrompts: [ProductPrintPrompt, ProductPrintPrompt, ProductPrintPrompt];
  groupPrompt: GroupProductPrompt;
  evaluation: CompressionEvaluation;
};
```

## Source Evidence

```ts
export type SourceEvidence = {
  inputUrl: string;
  normalizedUrl: string;
  canonicalRootDomain: string;
  title: string;
  description: string;
  textSample: string;
  ogImage?: string | null;
  favicon?: string | null;
};
```

## Brand Distillation

```ts
export type BrandDistillation = {
  brandName: string;
  domain: string;
  thesis: string;
  archetype: string;
  worldview: string;
  emotionalPosture: string;
  visualDna: {
    shapes: string[];
    motifs: string[];
    materials: string[];
    compositionRules: string[];
    palette: string[];
    signatureGesture: string;
  };
  language: {
    tone: string;
    phraseBank: string[];
    forbiddenPhrases: string[];
  };
  safety: {
    avoid: string[];
    sourceClaimsOnly: boolean;
    logoPolicy: "avoid_exact_logo" | "public_reference_only";
  };
};
```

## Product Triad

```ts
export type ProductTriad = {
  dropConcept: string;
  dropLore: string;
  sharedVisualSystem: string;
  relics: [RelicIntent, RelicIntent, RelicIntent];
};

export type RelicIntent = {
  relicIndex: 1 | 2 | 3;
  name: string;
  roleInTriptych: string;
  objectFunction: "body" | "carrier" | "witness" | "utility" | "signal";
  physicalArchetype: "garment" | "poster" | "tote" | "sticker" | "hat" | "other";
  targetProductFamily: string;
  visualDensity: "low" | "medium" | "high";
  description: string;
  whyThisExists: string;
  artDirection: string;
  suggestedPriceCents: number;
};
```

## Printful Product Selection

```ts
export type SelectedPrintfulProduct = {
  relicIndex: 1 | 2 | 3;
  relicName: string;
  catalogProductId: number;
  catalogVariantId: number;
  sku?: string;
  productName: string;
  productType: string;
  variantName: string;
  variantColor?: string;
  variantSize?: string;
  placement: string;
  technique: string;
  printAreaType: "simple";
  selectionSource: "llm_candidate" | "deterministic_match" | "critic_ranked";
  selectionReason: string;
  rawCatalogSnapshotJson: unknown;
};
```

Migration note:

- Add `sku?: string` to `RelicFulfillmentSpec`.
- Parse common variant SKU keys from Printful raw variant data: `sku`, `catalog_variant_sku`, `variant_sku`.
- Preserve raw snapshot for forward compatibility.

## Product Print Prompt

```ts
export type ProductPrintPrompt = {
  relicIndex: 1 | 2 | 3;
  promptVersion: string;
  selectedProduct: {
    catalogProductId: number;
    catalogVariantId: number;
    sku?: string;
    productName: string;
    variantName: string;
    placement: string;
    technique: string;
  };
  prompt: string;
  negativePrompt: string;
  references: {
    ogImage?: string | null;
    favicon?: string | null;
    siblingRelicNames: string[];
  };
  requiredMentions: string[];
};
```

## Group Product Prompt

```ts
export type GroupProductPrompt = {
  promptVersion: string;
  aspectRatio: "1200x630";
  prompt: string;
  selectedProductIds: [number, number, number];
  selectedVariantIds: [number, number, number];
  requiredMentions: [string, string, string];
  referenceImagePolicy: "use_uploaded_product_images" | "use_mockups" | "use_print_art";
};
```

## Evaluation

```ts
export type CompressionEvaluation = {
  passes: boolean;
  scores: {
    brandFidelity: number;
    triptychCohesion: number;
    productContrast: number;
    printfulValidity: number;
    skuCompleteness: number;
    printPromptReadiness: number;
    groupPromptReadiness: number;
    safety: number;
  };
  blockers: string[];
  notes: string[];
};
```

## Minimum Validator Rules

```text
selectedProducts.length === 3
printPrompts.length === 3
catalogProductId is positive integer
catalogVariantId is positive integer
placement is non-empty
technique is non-empty
each print prompt mentions productName, variantName, placement, technique, roleInTriptych
group prompt mentions all three relic names and all three product names
group prompt forbids extra products, fake UI chrome, exact unauthorized logos, and celebrity likenesses
```
