# Five Compression Mechanisms

Each mechanism starts from the same raw input and ends with the same target artifact. The difference is where compression happens and which layer is allowed to make product decisions.

## Shared Target Contract

```ts
type DroplinkBirthBundle = {
  source: {
    inputUrl: string;
    canonicalRootDomain: string;
    title: string;
    description: string;
    textSample: string;
    sourceImages: string[];
  };
  brandDistillation: BrandDistillation;
  productTriad: ProductTriad;
  selectedProducts: [SelectedPrintfulProduct, SelectedPrintfulProduct, SelectedPrintfulProduct];
  printPrompts: [ProductPrintPrompt, ProductPrintPrompt, ProductPrintPrompt];
  groupPrompt: GroupProductPrompt;
  evaluation: CompressionEvaluation;
};
```

```ts
type SelectedPrintfulProduct = {
  relicIndex: 1 | 2 | 3;
  role: "body" | "carrier" | "wall" | "utility" | "signal" | "witness";
  catalogProductId: number;
  catalogVariantId: number;
  sku?: string;
  productName: string;
  variantName: string;
  placement: string;
  technique: string;
  printAreaType: "simple";
  selectionReason: string;
};
```

## 1. Symbolic Funnel

Compress the URL into a small symbolic grammar before choosing products. This is closest to the current pipeline, but it makes the intermediate layer stricter and smaller.

Flow:

```text
URL evidence
  -> BrandDistillation
  -> SymbolGrammar
  -> ProductTriad
  -> Printful selection
  -> prompts
```

Data contract:

```ts
type SymbolGrammar = {
  thesis: string;
  threeMotifs: [string, string, string];
  forbiddenMotifs: string[];
  palette: [string, string, string, string];
  compositionRules: [string, string, string];
  materialMood: string;
  phraseBank: string[];
};
```

Product/SKU selection:

- Hermes chooses only roles and product families, not SKUs.
- Code maps each role to catalog candidates: body -> tee/hoodie, carrier -> tote, wall -> poster/print.
- Code scores live Printful products and variants, then records catalog product id, variant id, variant SKU if present, placement, and technique.

Print prompt rule:

- Prompt = selected product facts + one motif + one composition rule + one phrase-bank item + role in triptych.
- Each prompt must reference the selected placement and technique.

Group prompt rule:

- Prompt = thesis + all 3 product names + roles + shared palette + instruction to show the objects as a finite triptych, not a lifestyle scene.

Strength:

- Very testable. Small intermediate grammar makes drift visible.

Failure mode:

- Can become too formulaic if SymbolGrammar is bland.

Best metric:

- Motif carry-through score: how many motifs appear coherently in all three prompts without copying brand marks.

Implementation fit:

- Low-risk evolution of `hermesDropAgent.ts`; product matching can remain deterministic.

## 2. Catalog-First Constraint

Choose the Printful catalog shortlist before brand planning. Hermes receives concrete product/variant affordances up front and must create within those boundaries.

Flow:

```text
URL evidence
  -> fetch Printful catalog/variant shortlist
  -> BrandDistillation
  -> constrained triad planning
  -> prompts
```

Data contract:

```ts
type CatalogCandidate = {
  catalogProductId: number;
  catalogVariantId: number;
  sku?: string;
  productName: string;
  variantName: string;
  productType: string;
  placement: string;
  technique: string;
  color?: string;
  size?: string;
};
```

Product/SKU selection:

- Code builds 12-18 candidates from live Printful metadata.
- Candidate generation should prefer stable, front-printable products: tee/hoodie, tote, poster, sticker, cap where placement supports file upload.
- Hermes chooses exactly 3 candidate ids from this list and explains their narrative roles.
- Code validates the selected ids against the candidate list and persists SKU when present.

Print prompt rule:

- Prompt is tailored to physical constraints in the candidate object.
- Example constraints: poster supports dense detail; tee/tote need strong centered mark; cap needs simple high-contrast mark.

Group prompt rule:

- Uses the exact product names and variant names, so the group scene is anchored in real product forms.

Strength:

- Highest manufacturability. SKU choice is not inferred after creative planning.

Failure mode:

- Brand creativity can be constrained by whatever catalog shortlist was generated.

Best metric:

- Variant validity rate: selected product/variant/SKU choices still pass Printful mockup/order-item construction.

Implementation fit:

- Requires `printfulCatalogOptionsForPlanning` to expose variant-level candidates, not just product keys.

## 3. Archetype Lattice

Compress brand meaning and catalog affordances into a fixed 3-slot lattice. The system forces one object per function: body, carrier, witness.

Flow:

```text
URL evidence
  -> BrandDistillation
  -> LatticeSlots(body, carrier, witness)
  -> Printful mapping per slot
  -> prompts
```

Data contract:

```ts
type LatticeSlot = {
  slot: "body" | "carrier" | "witness";
  emotionalJob: string;
  visualJob: string;
  allowedProductTypes: string[];
  disallowedProductTypes: string[];
  printComplexity: "low" | "medium" | "high";
};
```

Product/SKU selection:

- Body: tee or hoodie, one fixed common size/color variant.
- Carrier: tote or bag.
- Witness: poster/print.
- Code picks the strongest catalog product and variant per slot using explicit slot filters and placement support.

Print prompt rule:

- Body gets iconic centered artwork.
- Carrier gets portable ritual/symbol artwork.
- Witness gets the richest narrative poster.

Group prompt rule:

- Show the three objects as a sequence: worn signal, carried signal, wall signal.

Strength:

- Strong default structure for a finite 3-relic story.

Failure mode:

- Repetition across drops if slots never vary.

Best metric:

- Triptych contrast score: three outputs share visual DNA but differ by function and composition.

Implementation fit:

- Very practical as a first experiment because it can wrap the current deterministic selector.

## 4. Critic-Ranked Beam

Generate multiple candidate triads, resolve each to Printful variants, then let a critic choose the best manufacturable triad.

Flow:

```text
URL evidence
  -> BrandDistillation
  -> N candidate triads
  -> Printful resolution for each
  -> critic ranking
  -> prompts for winner
```

Data contract:

```ts
type CandidateTriad = {
  candidateId: string;
  dropConcept: string;
  relics: [RelicConcept, RelicConcept, RelicConcept];
  resolvedProducts?: [SelectedPrintfulProduct, SelectedPrintfulProduct, SelectedPrintfulProduct];
  score?: {
    brandFit: number;
    triptychCohesion: number;
    productContrast: number;
    manufacturability: number;
    promptReadiness: number;
  };
};
```

Product/SKU selection:

- For each candidate relic, code resolves product/variant/SKU with current or improved Printful matching.
- Candidates that cannot resolve all 3 products are rejected before critique.

Print prompt rule:

- Only the winning triad gets final print prompts.
- The critic returns one instruction per product about what to preserve from the candidate and what to avoid.

Group prompt rule:

- Uses the critic's winning rationale as the group image thesis.

Strength:

- Better creative search without losing deterministic validation.

Failure mode:

- More LLM and Printful catalog calls; needs caching and cost controls.

Best metric:

- Win margin and rejection reason distribution: why candidates lose.

Implementation fit:

- Medium complexity. Best after adding a structured experiment runner.

## 5. Prompt Compiler

Treat the pipeline as a compiler. Brand study becomes an intermediate representation, products are target-specific lowering, and prompts are generated from deterministic templates.

Flow:

```text
URL evidence
  -> BrandIR
  -> DropIR
  -> PrintfulIR
  -> PromptIR
  -> final strings
```

Data contract:

```ts
type PromptIR = {
  globalStyle: {
    palette: string[];
    motifs: string[];
    forbidden: string[];
    sharedComposition: string;
  };
  productPrompts: Array<{
    relicIndex: 1 | 2 | 3;
    selectedProduct: SelectedPrintfulProduct;
    subject: string;
    composition: string;
    typographyRule: string;
    negativePrompt: string;
  }>;
  groupScene: {
    aspectRatio: "1200x630";
    arrangement: string;
    productOrdering: [1, 2, 3];
    backgroundRule: string;
    textRule: string;
  };
};
```

Product/SKU selection:

- Code owns SKU selection completely.
- Hermes never emits product ids; it emits role, visual density, and product-function intent.
- PrintfulIR contains normalized product id, variant id, SKU, placement, print area, technique, and mockup compatibility.

Print prompt rule:

- Deterministic compiler emits the final prompt from PromptIR.
- This makes prompts diffable and unit-testable.

Group prompt rule:

- Deterministic compiler emits a group prompt from `groupScene` and the three selected products.

Strength:

- Most maintainable and easiest to test.

Failure mode:

- May feel less magical unless the BrandIR is rich enough.

Best metric:

- Prompt determinism and downstream image quality: same IR should produce stable prompt structure while preserving brand-specific content.

Implementation fit:

- Best long-term architecture for DropLink birth. It gives Hermes creative authority over meaning, while code owns catalog correctness.

## Recommendation

Run the first experiments in this order:

1. Archetype Lattice: fastest way to force a coherent 3-relic shape.
2. Catalog-First Constraint: fastest way to guarantee real Printful products/variants/SKUs.
3. Prompt Compiler: best long-term architecture once the contract is clear.
4. Critic-Ranked Beam: add after candidate scoring and caching exist.
5. Symbolic Funnel: useful as a lightweight variant or fallback.

The likely production direction is a hybrid:

```text
Catalog-First Constraint
  + Archetype Lattice
  + Prompt Compiler
  + optional Critic-Ranked Beam for high-value runs
```
