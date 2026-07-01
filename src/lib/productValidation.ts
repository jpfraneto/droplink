import type {
  Asset,
  Brand,
  Drop,
  ProductValidationIssue,
  ProductValidationResult,
  PublicDropMode,
  Relic,
  Storefront,
  UniversalSlot
} from "./types";

export type VesselCategory = "apparel" | "display" | "use" | "bag" | "drinkware" | "notebook" | "candle" | "sticker" | "other";

const INTERNAL_WORDS = ["relic", "triptych", "ritual", "artifact", "witness", "threshold", "instrument", "sovereign", "void"];
const NOTEBOOK_WORDS = ["notebook", "journal", "spiral", "cover", "pages"];
const APPAREL_WORDS = ["hoodie", "tee", "t-shirt", "shirt", "garment", "wearable", "sweatshirt", "jersey", "long sleeve"];
const BAG_WORDS = ["backpack", "tote", "bag", "duffle", "duffel", "carry", "pouch"];
const CANDLE_WORDS = ["candle", "wax", "soy wax", "scent"];
const DIRECT_MARK_WORDS = ["logo", "official slogan", "exact slogan", "trademark", "wordmark", "brand mark", "official mark"];

function clean(input: string | null | undefined) {
  return (input || "").toLowerCase();
}

function hasAny(haystack: string, words: string[]) {
  return words.some((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(haystack));
}

function countAny(haystack: string, words: string[]) {
  return words.reduce((sum, word) => sum + (hasAny(haystack, [word]) ? 1 : 0), 0);
}

export function publicDropMode(input: { drop?: Pick<Drop, "domainClaimStatus" | "status"> | null; storefront?: Pick<Storefront, "claimStatus"> | null }): PublicDropMode {
  return input.drop?.domainClaimStatus === "verified" || input.storefront?.claimStatus === "verified" || input.drop?.status === "claimed" || input.drop?.status === "published"
    ? "claimed_official"
    : "scouted_unclaimed";
}

export function vesselCategory(input: string | null | undefined): VesselCategory {
  const text = clean(input);
  if (/candle|soy wax|wax/.test(text)) return "candle";
  if (/notebook|journal|spiral/.test(text)) return "notebook";
  if (/tote|duffle|duffel|backpack|pouch|\bbag\b/.test(text)) return "bag";
  if (/mug|bottle|drink|tumbler/.test(text)) return "drinkware";
  if (/poster|canvas|postcard|print|wall art|framed/.test(text)) return "display";
  if (/sticker|decal/.test(text)) return "sticker";
  if (/tee|t-shirt|shirt|hoodie|sweatshirt|jersey|long sleeve|cap|hat|beanie|fleece/.test(text)) return "apparel";
  return "other";
}

export function slotForVessel(category: VesselCategory): UniversalSlot | null {
  if (category === "apparel") return "WEAR";
  if (category === "bag" || category === "drinkware" || category === "notebook") return "USE";
  if (category === "display" || category === "sticker" || category === "candle") return "DISPLAY";
  return null;
}

export function inferUniversalSlot(input: {
  universalSlot?: string | null;
  role?: string | null;
  productFamily?: string | null;
  productName?: string | null;
  productType?: string | null;
  productCategory?: string | null;
}): UniversalSlot | null {
  const explicit = clean(input.universalSlot);
  if (explicit === "wear" || explicit === "display" || explicit === "use") return explicit.toUpperCase() as UniversalSlot;
  const role = clean(input.role);
  if (/\bwear\b/.test(role)) return "WEAR";
  if (/\bdisplay\b/.test(role)) return "DISPLAY";
  if (/\buse\b/.test(role)) return "USE";
  return slotForVessel(vesselCategory(`${input.productName || ""} ${input.productType || ""} ${input.productCategory || ""} ${input.productFamily || ""}`));
}

export function storyRoleFromRole(role: string | null | undefined): string | null {
  const stripped = (role || "").replace(/\b(WEAR|DISPLAY|USE)\b\s*[/:-]?\s*/i, "").trim();
  return stripped || null;
}

function vesselNoun(category: VesselCategory, vesselName: string) {
  const text = clean(vesselName);
  if (category === "candle") return "Candle";
  if (category === "notebook") return "Notebook";
  if (category === "bag") {
    if (/backpack/.test(text)) return "Backpack";
    if (/duffle|duffel/.test(text)) return "Duffle";
    if (/pouch/.test(text)) return "Pouch";
    return "Tote";
  }
  if (category === "drinkware") {
    if (/bottle/.test(text)) return "Bottle";
    if (/tumbler/.test(text)) return "Tumbler";
    return "Mug";
  }
  if (category === "display") {
    if (/canvas/.test(text)) return "Canvas";
    if (/postcard/.test(text)) return "Postcard";
    return "Poster";
  }
  if (category === "sticker") return "Sticker";
  if (category === "apparel") {
    if (/hoodie/.test(text)) return "Hoodie";
    if (/sweatshirt/.test(text)) return "Sweatshirt";
    if (/jersey/.test(text)) return "Jersey";
    if (/long sleeve/.test(text)) return "Long Sleeve";
    if (/hat|cap|beanie/.test(text)) return "Cap";
    return "Tee";
  }
  return "Object";
}

function removeContradictoryProductWords(input: string, category: VesselCategory) {
  const forbidden =
    category === "apparel" ? [...NOTEBOOK_WORDS, ...BAG_WORDS, ...CANDLE_WORDS] :
    category === "bag" ? [...NOTEBOOK_WORDS, ...CANDLE_WORDS, "hoodie", "shirt", "garment", "tee", "t-shirt"] :
    category === "candle" ? [...NOTEBOOK_WORDS, ...BAG_WORDS, ...APPAREL_WORDS] :
    category === "notebook" ? [...APPAREL_WORDS, ...BAG_WORDS, ...CANDLE_WORDS] :
    category === "display" || category === "sticker" ? [...APPAREL_WORDS, ...BAG_WORDS, ...NOTEBOOK_WORDS, ...CANDLE_WORDS] :
    [];
  let output = input;
  for (const word of forbidden) {
    output = output.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "gi"), "").replace(/\s{2,}/g, " ");
  }
  return output.trim();
}

export function vesselLockedConcept(input: {
  name: string;
  description: string;
  whyThisExists: string;
  productFamily: string;
  vesselName: string;
  role?: string | null;
  universalSlot?: UniversalSlot | null;
}) {
  const category = vesselCategory(input.vesselName);
  const noun = vesselNoun(category, input.vesselName);
  const slot = input.universalSlot || slotForVessel(category) || inferUniversalSlot({ role: input.role, productFamily: input.productFamily, productName: input.vesselName });
  const nameBase = removeContradictoryProductWords(input.name, category).replace(/[,\-:]\s*$/, "").trim();
  const name = hasAny(clean(nameBase), [noun.toLowerCase()]) ? nameBase : `${nameBase || "Signal"} ${noun}`;
  const descriptionBase = removeContradictoryProductWords(input.description, category);
  const whyBase = removeContradictoryProductWords(input.whyThisExists, category);
  const article = /^[aeiou]/i.test(noun) ? "An" : "A";
  return {
    name,
    description: descriptionBase || `${article} ${noun.toLowerCase()} shaped by the brand signal.`,
    whyThisExists: whyBase || `This ${noun.toLowerCase()} gives the public signal a physical form.`,
    productFamily: input.vesselName,
    universalSlot: slot,
    storyRole: storyRoleFromRole(input.role)
  };
}

function issue(relic: Relic, code: string, message: string): ProductValidationIssue {
  return { relicId: relic.id, relicName: relic.name, code, message };
}

function publicCopyForRelic(relic: Relic) {
  return `${relic.name} ${relic.description} ${relic.whyThisExists}`.toLowerCase();
}

export function validateProducts(input: {
  brand: Brand;
  drop?: Drop | null;
  storefront?: Storefront | null;
  relics: Relic[];
  assets?: Asset[];
  checkedAt?: string;
}): ProductValidationResult {
  const blocking_errors: ProductValidationIssue[] = [];
  const warnings: ProductValidationIssue[] = [];
  const mode = publicDropMode({ drop: input.drop, storefront: input.storefront });
  const adultDefault = !/(kid|kids|youth|child|children|school|student|toy|game|junior)/i.test(
    `${input.brand.name} ${input.brand.hostname} ${input.drop?.canonicalUrl || ""}`
  );

  for (const relic of input.relics) {
    const spec = relic.fulfillmentSpecJson || null;
    const vesselText = `${spec?.productName || ""} ${spec?.productType || ""} ${spec?.productCategory || ""} ${relic.productFamily || ""}`;
    const category = vesselCategory(vesselText);
    const expectedSlot = slotForVessel(category);
    const universalSlot = inferUniversalSlot({
      universalSlot: spec?.universalSlot,
      role: spec?.storyRole || undefined,
      productFamily: relic.productFamily,
      productName: spec?.productName,
      productType: spec?.productType,
      productCategory: spec?.productCategory
    });
    const concept = publicCopyForRelic(relic);
    const lifestylePrompt = clean(input.assets?.find((asset) => asset.relicId === relic.id && asset.type === "lifestyle")?.prompt);
    const artPrompt = clean(input.assets?.find((asset) => asset.relicId === relic.id && asset.type === "print_file")?.prompt);
    const promptText = `${lifestylePrompt} ${artPrompt}`;

    if (!universalSlot) {
      blocking_errors.push(issue(relic, "universal_slot_missing", `BLOCKED: ${relic.name} is missing universal_slot.`));
    } else if (expectedSlot && universalSlot !== expectedSlot) {
      blocking_errors.push(issue(relic, "universal_slot_vessel_mismatch", `BLOCKED: universal_slot ${universalSlot} contradicts vessel ${spec?.productName || relic.productFamily}. Expected ${expectedSlot}.`));
    }

    if (hasAny(concept, NOTEBOOK_WORDS) && category === "apparel") {
      blocking_errors.push(issue(relic, "notebook_on_apparel", `BLOCKED: concept says notebook, vessel is ${spec?.productName || relic.productFamily}.`));
    }
    if (hasAny(concept, APPAREL_WORDS) && category !== "apparel") {
      blocking_errors.push(issue(relic, "apparel_on_non_apparel", `BLOCKED: concept says apparel, vessel is ${spec?.productName || relic.productFamily}.`));
    }
    if (hasAny(concept, BAG_WORDS) && category !== "bag") {
      blocking_errors.push(issue(relic, "bag_on_wrong_vessel", `BLOCKED: concept says bag/carry object, vessel is ${spec?.productName || relic.productFamily}.`));
    }
    if (hasAny(concept, CANDLE_WORDS) && category !== "candle") {
      blocking_errors.push(issue(relic, "candle_on_wrong_vessel", `BLOCKED: concept says candle, vessel is ${spec?.productName || relic.productFamily}.`));
    }
    if (/\bwearing\b|\bworn\b/.test(lifestylePrompt) && category !== "apparel") {
      blocking_errors.push(issue(relic, "wearing_prompt_wrong_vessel", `BLOCKED: lifestyle prompt says wearing, vessel is ${spec?.productName || relic.productFamily}.`));
    }
    if (/using the product naturally/.test(lifestylePrompt) && category === "apparel") {
      warnings.push(issue(relic, "apparel_lifestyle_wording", `WARNING: apparel lifestyle prompt should say wearing the product naturally.`));
    }
    if (/youth/i.test(vesselText) && adultDefault) {
      warnings.push(issue(relic, "youth_default_brand", `WARNING: Youth apparel selected for adult/default brand.`));
    }
    if (mode === "scouted_unclaimed" && (hasAny(concept, DIRECT_MARK_WORDS) || hasAny(promptText, DIRECT_MARK_WORDS))) {
      warnings.push(issue(relic, "unclaimed_direct_mark_language", `WARNING: unclaimed scout proposal asks for exact logos, marks, slogans, or official brand language.`));
    }
    if (countAny(concept, INTERNAL_WORDS) >= 3) {
      warnings.push(issue(relic, "internal_lore_overuse", `WARNING: public copy may sound too internally DropLink-ish.`));
    }
  }

  return {
    status: blocking_errors.length ? "blocked" : warnings.length ? "warning" : "valid",
    mode,
    blocking_errors,
    warnings,
    checkedAt: input.checkedAt || new Date().toISOString()
  };
}
