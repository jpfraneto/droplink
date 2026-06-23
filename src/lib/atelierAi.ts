import { z } from "zod";
import { loggedExternalCall } from "./logger";
import type { BrandStudyJson, RelicPlanJson } from "./types";

export const BRAND_STUDY_PROMPT_VERSION = "brand-study-v1";
export const RELIC_PLAN_PROMPT_VERSION = "relic-plan-v1";

const brandStudySchema = z.object({
  brand_name: z.string().min(1),
  domain: z.string().min(1),
  essence: z.string().min(1),
  worldview: z.string().min(1),
  emotional_posture: z.string().min(1),
  aesthetic_motifs: z.array(z.string()).min(2),
  color_palette: z.array(z.string()).min(3),
  language_style: z.string().min(1),
  what_they_care_about: z.array(z.string()).min(2),
  what_they_bring_to_the_world: z.string().min(1),
  things_to_avoid: z.array(z.string()).min(1),
  product_strategy_notes: z.string().min(1)
});

const relicPlanSchema = z.object({
  collection_title: z.string().min(1),
  collection_subtitle: z.string().min(1),
  relics: z.array(
    z.object({
      name: z.string().min(1),
      archetype: z.string().min(1),
      physical_archetype: z.enum(["garment", "poster", "tote", "sticker", "hat", "print", "other"]).default("other"),
      product_family: z.string().min(1),
      description: z.string().min(1),
      why_this_exists: z.string().min(1),
      art_direction: z.string().min(1),
      suggested_price_cents: z.number().int().min(1200),
      printful_product_key: z.string().min(1)
    })
  )
});

export function validateBrandStudy(input: unknown): BrandStudyJson {
  return brandStudySchema.parse(input);
}

export function validateRelicPlan(input: unknown, relicCount: 3 | 8): RelicPlanJson {
  const parsed = relicPlanSchema.parse(input);
  if (parsed.relics.length !== relicCount) {
    throw new Error(`Relic plan must contain exactly ${relicCount} relics.`);
  }
  return parsed;
}

export async function studyBrand(input: {
  url: string;
  domain: string;
  title: string;
  description: string;
  textSample: string;
  traceId: string;
  requestId?: string | null;
}): Promise<{ study: BrandStudyJson; modelVersion: string }> {
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    return loggedExternalCall(
      { provider: "openai", operation: "brand_study", traceId: input.traceId, requestId: input.requestId },
      async () => {
        const model = process.env.OPENAI_MODEL || "gpt-5.5";
        const text = await openAiJson({
          model,
          schemaName: "droplink_brand_study",
          schema: brandStudyJsonSchema(),
          prompt: [
            "You are the artifact of a cosmic atelier that came to earth to distill the core essence of the coolest brands humans have created.",
            "Study this public brand URL and output only JSON. Do not invent private facts. Do not create products.",
            `URL: ${input.url}`,
            `Domain: ${input.domain}`,
            `Title: ${input.title}`,
            `Description: ${input.description}`,
            `Visible text sample: ${input.textSample.slice(0, 1800)}`
          ].join("\n\n")
        });
        return { study: validateBrandStudy(JSON.parse(text)), modelVersion: model };
      }
    );
  }
  return { study: mockBrandStudy(input), modelVersion: "mock" };
}

export async function planRelics(input: {
  study: BrandStudyJson;
  relicCount: 3 | 8;
  collectionType: "genesis" | "weekly";
  traceId: string;
  requestId?: string | null;
}): Promise<{ plan: RelicPlanJson; modelVersion: string }> {
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    return loggedExternalCall(
      { provider: "openai", operation: "relic_plan", traceId: input.traceId, requestId: input.requestId },
      async () => {
        const model = process.env.OPENAI_MODEL || "gpt-5.5";
        const text = await openAiJson({
          model,
          schemaName: "droplink_relic_plan",
          schema: relicPlanJsonSchema(input.relicCount),
          prompt: [
            "You are the artifact of a cosmic atelier that came to earth to distill the core essence of the coolest brands humans have created.",
            `Create exactly ${input.relicCount} unique merch products for a ${input.collectionType} collection.`,
            "Each product must have exactly one fixed product family and one fixed purchasable variant later. No sizes, no colors, no quantities.",
            "Each product must include physical_archetype: garment, poster, tote, sticker, hat, print, or other.",
            "Useful product families: premium tee, heavyweight hoodie, tote bag, notebook, mug, poster, framed poster, laptop sleeve, hat, sticker.",
            `Brand study JSON: ${JSON.stringify(input.study)}`
          ].join("\n\n")
        });
        return { plan: validateRelicPlan(JSON.parse(text), input.relicCount), modelVersion: model };
      }
    );
  }
  return { plan: mockRelicPlan(input.study, input.relicCount, input.collectionType), modelVersion: "mock" };
}

async function openAiJson(input: { model: string; schemaName: string; schema: Record<string, unknown>; prompt: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: input.model,
      input: input.prompt,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema
        }
      }
    })
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  };
  const content = json.output?.flatMap((item) => item.content || []) || [];
  const refusal = content.find((item) => typeof item.refusal === "string")?.refusal;
  if (refusal) throw new Error(`OpenAI refused structured output: ${refusal}`);
  const text = json.output_text || content.find((item) => typeof item.text === "string")?.text;
  if (!text) throw new Error("OpenAI response did not include JSON text.");
  return text;
}

function brandStudyJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "brand_name",
      "domain",
      "essence",
      "worldview",
      "emotional_posture",
      "aesthetic_motifs",
      "color_palette",
      "language_style",
      "what_they_care_about",
      "what_they_bring_to_the_world",
      "things_to_avoid",
      "product_strategy_notes"
    ],
    properties: {
      brand_name: { type: "string" },
      domain: { type: "string" },
      essence: { type: "string" },
      worldview: { type: "string" },
      emotional_posture: { type: "string" },
      aesthetic_motifs: { type: "array", minItems: 2, items: { type: "string" } },
      color_palette: { type: "array", minItems: 3, items: { type: "string" } },
      language_style: { type: "string" },
      what_they_care_about: { type: "array", minItems: 2, items: { type: "string" } },
      what_they_bring_to_the_world: { type: "string" },
      things_to_avoid: { type: "array", minItems: 1, items: { type: "string" } },
      product_strategy_notes: { type: "string" }
    }
  };
}

function relicPlanJsonSchema(relicCount: 3 | 8) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["collection_title", "collection_subtitle", "relics"],
    properties: {
      collection_title: { type: "string" },
      collection_subtitle: { type: "string" },
      relics: {
        type: "array",
        minItems: relicCount,
        maxItems: relicCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "archetype",
            "physical_archetype",
            "product_family",
            "description",
            "why_this_exists",
            "art_direction",
            "suggested_price_cents",
            "printful_product_key"
          ],
          properties: {
            name: { type: "string" },
            archetype: { type: "string" },
            physical_archetype: { type: "string", enum: ["garment", "poster", "tote", "sticker", "hat", "print", "other"] },
            product_family: { type: "string" },
            description: { type: "string" },
            why_this_exists: { type: "string" },
            art_direction: { type: "string" },
            suggested_price_cents: { type: "integer", minimum: 1200 },
            printful_product_key: { type: "string" }
          }
        }
      }
    }
  };
}

function fallbackName(domain: string) {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mockBrandStudy(input: { domain: string; title: string; description: string; textSample: string }): BrandStudyJson {
  const brandName = input.title && input.title.length < 80 ? input.title.replace(/\s*[|-].*$/, "") : fallbackName(input.domain);
  const essence = input.description || input.textSample.slice(0, 160) || `${brandName} carries a focused internet signal.`;
  return validateBrandStudy({
    brand_name: brandName,
    domain: input.domain,
    essence,
    worldview: `${brandName} believes useful things should feel alive, memorable, and worth sharing.`,
    emotional_posture: "precise, strange, optimistic, and builder-native",
    aesthetic_motifs: ["signal marks", "threshold diagrams", "portable rituals"],
    color_palette: ["#111111", "#ff4f2e", "#f5d36b", "#58a6ff"],
    language_style: "short, charged, internet-native phrases with clear nouns",
    what_they_care_about: ["creative leverage", "community proof", "shipping visible work"],
    what_they_bring_to_the_world: `${brandName} gives people a sharper way to recognize and gather around its idea.`,
    things_to_avoid: ["counterfeit logos", "generic startup merch", "private claims", "celebrity likenesses"],
    product_strategy_notes: "Make artifacts that feel like proof of belonging, not branded swag."
  });
}

function mockRelicPlan(study: BrandStudyJson, relicCount: 3 | 8, collectionType: "genesis" | "weekly"): RelicPlanJson {
  const families = ["premium tee", "heavyweight hoodie", "poster", "tote bag", "notebook", "mug", "framed poster", "laptop sleeve"];
  const archetypes = ["body", "shrine", "wall", "carry", "desk", "drink", "ritual", "tool"];
  const relics = Array.from({ length: relicCount }, (_, index) => {
    const family = families[index % families.length];
    const archetype = archetypes[index % archetypes.length];
    return {
      name: index === 0 ? `${study.brand_name} Genesis Signal` : `${study.brand_name} ${archetype[0].toUpperCase()}${archetype.slice(1)} ${index + 1}`,
      archetype,
      physical_archetype: family.includes("tee") || family.includes("hoodie") ? "garment" : family.includes("poster") ? "poster" : family.includes("tote") ? "tote" : "other",
      product_family: family,
      description: `A limited ${family} carrying the ${study.essence.slice(0, 86)} signal.`,
      why_this_exists: `This exists because ${study.brand_name} brought ${study.what_they_bring_to_the_world.slice(0, 140)}.`,
      art_direction: `${study.aesthetic_motifs.join(", ")} using ${study.color_palette.join(", ")}; avoid exact logos.`,
      suggested_price_cents: family.includes("hoodie") ? 8800 : family.includes("poster") ? 3800 : 5200,
      printful_product_key: family
    };
  });
  return validateRelicPlan(
    {
      collection_title: collectionType === "weekly" ? `${study.brand_name} Weekly Drop` : `${study.brand_name} Genesis Drop`,
      collection_subtitle:
        collectionType === "weekly" ? "this week's 8 products · 8 units each" : "3 unique products · 8 units each",
      relics
    },
    relicCount
  );
}
