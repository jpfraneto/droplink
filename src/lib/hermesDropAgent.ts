import { execFile as execFileCallback } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { droplinkDoctrineBlock, DROPLINK_DOCTRINE_VERSION } from "./droplinkDoctrine";
import { loggedExternalCall } from "./logger";
import type { BrandDiscoveryDossier, BrandStudyJson, RelicPlanJson } from "./types";

export const BRAND_STUDY_PROMPT_VERSION = `brand-study-agentic-2026-06+${DROPLINK_DOCTRINE_VERSION}`;
export const RELIC_PLAN_PROMPT_VERSION = `relic-triptych-vessel-slot-2026-06+${DROPLINK_DOCTRINE_VERSION}`;
export const RELIC_CRITIQUE_PROMPT_VERSION = `relic-critique-vessel-slot-2026-06+${DROPLINK_DOCTRINE_VERSION}`;

const execFile = promisify(execFileCallback);

type BrandStudyInput = {
  url: string;
  domain: string;
  title: string;
  description: string;
  textSample: string;
  discoveryDossier?: BrandDiscoveryDossier;
  traceId: string;
  requestId?: string | null;
};

type PlanRelicsInput = {
  study: BrandStudyJson;
  relicCount: 3;
  collectionType: "drop";
  printfulCatalogOptions?: Array<{ key: string; name: string; type: string; placements: string[] }>;
  traceId: string;
  requestId?: string | null;
};

type CritiqueRelicsInput = {
  study: BrandStudyJson;
  initialPlan: RelicPlanJson;
  relicCount?: 3;
  printfulCatalogOptions?: Array<{ key: string; name: string; type: string; placements: string[] }>;
  traceId: string;
  requestId?: string | null;
};

export type CreativeTask =
  | { type: "study_brand"; input: BrandStudyInput }
  | { type: "plan_relics"; input: PlanRelicsInput }
  | { type: "critique_relics"; input: CritiqueRelicsInput };

export type CreativeTaskResult =
  | { type: "study_brand"; study: BrandStudyJson; modelVersion: string }
  | { type: "plan_relics"; plan: RelicPlanJson; modelVersion: string }
  | { type: "critique_relics"; plan: RelicPlanJson; critique: string; modelVersion: string };

const brandStudySchema = z.object({
  brand_name: z.string().min(1),
  domain: z.string().min(1),
  archetype: z.string().min(1),
  invocation: z.string().min(800),
  essence: z.string().min(1),
  hidden_world: z.string().min(1),
  buyer_role: z.string().min(1),
  emotional_contract: z.string().min(1),
  worldview: z.string().min(1),
  emotional_posture: z.string().min(1),
  visual_dna: z.object({
    core_shapes: z.array(z.string()).min(2),
    material_feel: z.string().min(1),
    composition_rules: z.array(z.string()).min(2),
    signature_gesture: z.string().min(1)
  }),
  drop_narrative_seed: z.string().min(1),
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
  drop_concept: z.string().min(1),
  drop_lore: z.string().min(1),
  relics: z.array(
    z.object({
      name: z.string().min(1),
      archetype: z.string().min(1),
      universal_slot: z.enum(["WEAR", "DISPLAY", "USE"]),
      story_role: z.string().min(1),
      role_in_triptych: z.string().min(1),
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

const relicCritiqueSchema = z.object({
  critique_text: z.string().min(1),
  refined_plan: relicPlanSchema
});

export function validateBrandStudy(input: unknown): BrandStudyJson {
  return brandStudySchema.parse(input) as BrandStudyJson;
}

export function validateRelicPlan(input: unknown, relicCount: 3 | 8): RelicPlanJson {
  const parsed = relicPlanSchema.parse(input) as RelicPlanJson;
  if (parsed.relics.length !== relicCount) {
    throw new Error(`Relic plan must contain exactly ${relicCount} relics.`);
  }
  return parsed;
}

function validateRelicCritique(input: unknown, relicCount: 3 | 8): { critique_text: string; refined_plan: RelicPlanJson } {
  const parsed = relicCritiqueSchema.parse(input) as { critique_text: string; refined_plan: RelicPlanJson };
  validateRelicPlan(parsed.refined_plan, relicCount);
  return parsed;
}

function brandStudyPrompt(input: BrandStudyInput) {
  return [
    droplinkDoctrineBlock(),
    "",
    "ROLE",
    "You are Hermes/Anky, the DropLink creative agent. Your job is to distill a public brand signal into a living creative source that can later become finite physical relics.",
    "",
    "GOAL",
    "Interpret the brand as if it were a character with taste, posture, materials, rituals, and taboos. Make it useful for product creation without inventing private facts or claiming endorsement.",
    "",
    "METHOD",
    "1. Read the public evidence: URL, domain, title, description, visible text sample, and discovery dossier when provided.",
    "2. Anchor every brand claim in observed evidence. Separate observed brand signal from imaginative interpretation.",
    "3. Treat discovered social/profile/blog/docs/community links as the brand neighborhood, even if their pages were not fetched yet.",
    "4. Personify the brand in the invocation: 280-420 words, vivid but grounded, no generic startup language.",
    "5. Name the hidden_world: the symbolic world the buyer enters through this URL, grounded in public evidence.",
    "6. Name the buyer_role: who the buyer becomes by owning/using these objects, not a demographic segment.",
    "7. Name the emotional_contract: the promise/tension the brand asks the buyer to live with.",
    "8. Extract visual DNA from actual visual evidence first: ranked images, headings, repeated phrases, colors, motifs, screenshots, banners, and layout hints.",
    "9. Create a drop_narrative_seed that can bind exactly three future relics into one story.",
    "",
    "CONSTRAINTS",
    "Output only JSON that matches the schema. Think privately before writing final JSON.",
    "Do not create products yet. Do not invent founders, investors, users, metrics, partnerships, or private roadmap details.",
    "Avoid counterfeit logos, celebrity likenesses, copyrighted characters, and direct brand mark replication unless clearly present in the public source.",
    "",
    "PUBLIC SOURCE",
    `URL: ${input.url}`,
    `Domain: ${input.domain}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Visible text sample: ${input.textSample.slice(0, 2400)}`,
    input.discoveryDossier
      ? `DISCOVERY DOSSIER JSON: ${JSON.stringify({
          canonicalRootDomain: input.discoveryDossier.canonicalRootDomain,
          discoveredLinks: input.discoveryDossier.discoveredLinks.slice(0, 16),
          visualEvidence: input.discoveryDossier.visualEvidence.slice(0, 12),
          textSignals: {
            headings: input.discoveryDossier.textSignals.headings.slice(0, 10),
            repeatedPhrases: input.discoveryDossier.textSignals.repeatedPhrases.slice(0, 10)
          },
          debug: input.discoveryDossier.debug
        })}`
      : ""
  ].join("\n");
}

function relicPlanPrompt(
  input: PlanRelicsInput,
  catalogOptions: Array<{ key: string; name: string; type: string; placements: string[] }>
) {
  return [
    droplinkDoctrineBlock(),
    "",
    "ROLE",
    "You are Hermes/Anky, the DropLink creative agent. You turn one living brand study into a finite set of physical brand artifacts.",
    "",
    "GOAL",
    `Create exactly ${input.relicCount} products for one finite brand collection. They must feel intentionally related, not like unrelated merch ideas.`,
    "",
    "DROP RULES",
    "Each relic has exactly 8 physical editions. The complete run ends at 24 objects.",
    "Each relic must be purchasable through the provided Printful catalog options.",
    "Use printful_product_key exactly as provided. Do not invent catalog keys.",
    "HARD PRODUCT TRIAD: exactly one WEAR object, exactly one DISPLAY object, exactly one USE object.",
    "Every product must have universal_slot: WEAR, DISPLAY, or USE. Secondary roles like threshold, witness, instrument, key, node, lens, etc. are allowed only as story_role.",
    "WEAR must be a garment/hat category. DISPLAY must be poster/print/canvas/wall art/sticker only if no wall object exists. USE must be tote/bag/mug/bottle/notebook/laptop sleeve or another genuinely usable object.",
    "Do not create two garments. Do not create two bags. Do not let DISPLAY become apparel. If the brand wants several wearable ideas, choose the strongest one and force the other two into display/use.",
    "Each relic needs a distinct role_in_triptych that begins with its universal slot, e.g. WEAR / threshold, DISPLAY / witness, USE / instrument.",
    "You must first respect the actual product vessel from printful_product_key. The artifact concept is not allowed to contradict it. If the vessel is a tee, the object is a tee. If the vessel is a candle, the object is a candle. You may give the object symbolic meaning, but do not rename it into a different physical product.",
    "For unclaimed domains, avoid official logos, exact slogans, direct marks, or partnership language. Create an abstract brand-native tribute, not official merch.",
    "Public copy must be compressed and product-like. Internal lore may be poetic; customer-facing names, descriptions, and why_this_exists must be short, physical, and desirable.",
    "Internal words like DropLink, relic, edition, triptych, 1/3, 2/3, 3/3, #1, #2, #3, SKU, and product key must never appear as visible artwork text, product copy, or art_direction text.",
    "",
    "METHOD",
    "1. Re-read the brand invocation and drop_narrative_seed.",
    "2. Define a single drop_concept that binds the three relics emotionally and visually.",
    "3. Select three product forms that create contrast while sharing the same visual DNA: one worn on the body, one displayed in space, one used by hand.",
    "4. Make each relic necessary: it should advance the triptych story and carry a different function in the ritual. The role_in_triptych must begin with WEAR, DISPLAY, or USE.",
    "5. Keep the plan manufacturable as print-on-demand artwork: no impossible materials, electronics, embroidery-only assumptions, or multi-part objects.",
    "6. Write art_direction for the raw printable graphic only. It must describe the standalone artwork that goes onto Printful, not a hoodie/shirt/tote mockup, not a person wearing it, and not an ecommerce product photo.",
    "",
    "QUALITY BAR",
    "The plan should feel alive, collectible, and specific to this brand. Avoid generic slogans, literal website screenshots, cheap logo placement, and bland startup swag.",
    "Connect every relic explicitly to the invocation, visual_dna, and drop_narrative_seed.",
    "Every art_direction must be clear enough to generate an isolated print file: composition, symbols, palette, negative space, line style, and optional short text. Forbid product bodies, models, rooms, hangers, shadows, tags, and mockup framing.",
    "If the artwork includes text, it may only use brand-native language from the brand's world. Never include DropLink's internal mechanics, numbering, edition counts, or relic labels.",
    "Think privately before writing final JSON. Output only JSON that matches the schema.",
    "",
    `PRINTFUL CATALOG OPTIONS JSON: ${JSON.stringify(catalogOptions)}`,
    `BRAND STUDY JSON: ${JSON.stringify(input.study)}`
  ].join("\n");
}

function relicCritiquePrompt(
  input: CritiqueRelicsInput,
  catalogOptions: Array<{ key: string; name: string; type: string; placements: string[] }>
) {
  return [
    droplinkDoctrineBlock(),
    "",
    "ROLE",
    "You are Hermes/Anky in editor mode: a demanding creative director reviewing your own DropLink relic plan before it goes to image generation and production.",
    "",
    "GOAL",
    "Critique and refine the initial plan so the final three relics read as one cohesive triptych, faithful to the living brand, emotionally strong, and practical for Printful fulfillment.",
    "",
    "REVIEW CHECKLIST",
    "1. Cohesion: do the three relics share one drop_concept, visual DNA, and narrative arc?",
    "2. Fidelity: do they clearly arise from the brand invocation and drop_narrative_seed rather than generic merch tropes?",
    "3. Emotional strength: would a believer understand why these objects deserve to exist in only 8 editions each?",
    "4. Manufacturability: do the product families and printful_product_key values remain valid catalog choices?",
    "5. Image readiness: is the art_direction concrete enough for high-quality raw print artwork, and does it explicitly avoid product mockups, people, ecommerce scenes, and garment bodies?",
    "6. Product spread: is there exactly one WEAR, one DISPLAY, and one USE object? Reject duplicate garments, duplicate bags, and display concepts that became apparel.",
    "7. Vessel integrity: does every product name, description, why_this_exists, art_direction, and printful_product_key describe the same actual physical vessel?",
    "",
    "REFINEMENT RULES",
    "Return critique_text as a concise editorial note naming what changed and why.",
    "Return refined_plan as the improved complete plan, not a patch.",
    "Keep exactly three relics unless the schema asks otherwise. Preserve valid Printful keys exactly.",
    "Prefer a stronger product-category spread when the catalog allows it. Do not preserve duplicate hoodies just because the first draft chose them.",
    "Keep universal_slot canonical. Put poetic secondary roles only in story_role and role_in_triptych after the slot.",
    "For unclaimed domains, remove official-logo, exact-slogan, direct-mark, and partnership language.",
    "Compress public-facing copy. Keep the magic, but make product names and descriptions clear and physical.",
    "Ensure every refined art_direction describes only a standalone printable design asset. Do not ask image generation for the final product preview at this stage.",
    "Remove any visible-artwork instructions containing DropLink, relic, edition, triptych, 1/3, 2/3, 3/3, #1, #2, #3, SKU, or product key.",
    "Think privately before writing final JSON. Output only JSON that matches the schema.",
    "",
    `PRINTFUL CATALOG OPTIONS JSON: ${JSON.stringify(catalogOptions)}`,
    `BRAND STUDY JSON: ${JSON.stringify(input.study)}`,
    `INITIAL RELIC PLAN JSON: ${JSON.stringify(input.initialPlan)}`
  ].join("\n");
}

const defaultCatalogOptions = [
  { key: "heavyweight tee", name: "Heavyweight tee", type: "garment", placements: ["front"] },
  { key: "heavyweight hoodie", name: "Heavyweight hoodie", type: "garment", placements: ["front"] },
  { key: "poster", name: "Poster", type: "print", placements: ["front"] },
  { key: "tote bag", name: "Tote bag", type: "tote", placements: ["front"] },
  { key: "hat", name: "Hat", type: "hat", placements: ["front"] },
  { key: "sticker", name: "Sticker", type: "sticker", placements: ["front"] }
];

function hermesBridgeRequest(task: CreativeTask) {
  const mode = process.env.HERMES_BRIDGE_MODE || "agent";
  const maxTokens = Number(process.env.HERMES_BRIDGE_MAX_TOKENS || 3500);
  if (task.type === "study_brand") {
    const schema = brandStudyJsonSchema();
    return {
      mode,
      tag: "FEATURE_IDEA",
      max_tokens: maxTokens,
      prompt: hermesAgentPrompt({
        taskType: task.type,
        promptVersion: BRAND_STUDY_PROMPT_VERSION,
        schemaName: "droplink_brand_study",
        schema,
        prompt: brandStudyPrompt(task.input)
      })
    };
  }
  if (task.type === "plan_relics") {
    const catalogOptions = task.input.printfulCatalogOptions?.length ? task.input.printfulCatalogOptions : defaultCatalogOptions;
    const schema = relicPlanJsonSchema(task.input.relicCount, catalogOptions.map((entry) => entry.key));
    return {
      mode,
      tag: "FEATURE_IDEA",
      max_tokens: maxTokens,
      prompt: hermesAgentPrompt({
        taskType: task.type,
        promptVersion: RELIC_PLAN_PROMPT_VERSION,
        schemaName: "droplink_relic_plan",
        schema,
        prompt: relicPlanPrompt(task.input, catalogOptions)
      })
    };
  }
  const catalogOptions = task.input.printfulCatalogOptions?.length ? task.input.printfulCatalogOptions : defaultCatalogOptions;
  const relicCount = task.input.relicCount || 3;
  const schema = relicCritiqueJsonSchema(relicCount, catalogOptions.map((entry) => entry.key));
  return {
    mode,
    tag: "FEATURE_IDEA",
    max_tokens: maxTokens,
    prompt: hermesAgentPrompt({
      taskType: task.type,
      promptVersion: RELIC_CRITIQUE_PROMPT_VERSION,
      schemaName: "droplink_relic_critique",
      schema,
      prompt: relicCritiquePrompt(task.input, catalogOptions)
    })
  };
}

function hermesAgentPrompt(input: {
  taskType: CreativeTask["type"];
  promptVersion: string;
  schemaName: string;
  schema: Record<string, unknown>;
  prompt: string;
}) {
  return [
    input.prompt,
    "",
    "HERMES BRIDGE CONTRACT",
    `Task type: ${input.taskType}`,
    `Prompt version: ${input.promptVersion}`,
    `Return schema name: ${input.schemaName}`,
    "Return only valid JSON. Do not wrap it in Markdown. Do not include commentary before or after the JSON.",
    "The JSON must validate against this schema:",
    JSON.stringify(input.schema)
  ].join("\n");
}

function parseHermesBridgeResponse(task: CreativeTask, body: unknown): CreativeTaskResult {
  const parsed = parseBridgeJsonPayload(body);
  if (task.type === "study_brand") {
    const studyPayload =
      objectProperty(parsed, "study") ||
      objectProperty(parsed, "brand_study") ||
      objectProperty(parsed, "droplink_brand_study") ||
      findObjectWithKeys(parsed, ["brand_name", "archetype", "visual_dna"]) ||
      parsed;
    const study = validateBrandStudy(studyPayload);
    return { type: "study_brand", study, modelVersion: bridgeModelVersion(body) };
  }
  if (task.type === "plan_relics") {
    const planPayload =
      objectProperty(parsed, "plan") ||
      objectProperty(parsed, "relic_plan") ||
      objectProperty(parsed, "droplink_relic_plan") ||
      findObjectWithKeys(parsed, ["collection_title", "drop_concept", "relics"]) ||
      parsed;
    const plan = validateRelicPlan(planPayload, task.input.relicCount);
    return { type: "plan_relics", plan, modelVersion: bridgeModelVersion(body) };
  }
  const critiqueText = stringProperty(parsed, "critique_text") || stringProperty(parsed, "critique") || "";
  const refinedPlan =
    objectProperty(parsed, "refined_plan") ||
    objectProperty(parsed, "plan") ||
    findObjectWithKeys(parsed, ["collection_title", "drop_concept", "relics"]);
  const relicCount = task.input.relicCount || 3;
  if (refinedPlan) {
    const plan = validateRelicPlan(refinedPlan, relicCount);
    return { type: "critique_relics", plan, critique: critiqueText || "Hermes bridge returned a refined plan without critique text.", modelVersion: bridgeModelVersion(body) };
  }
  const critique = validateRelicCritique(parsed, relicCount);
  return { type: "critique_relics", plan: critique.refined_plan, critique: critique.critique_text, modelVersion: bridgeModelVersion(body) };
}

function findObjectWithKeys(input: unknown, keys: string[], depth = 4): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || depth < 0) return null;
  const record = input as Record<string, unknown>;
  if (keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))) return record;
  for (const value of Object.values(record)) {
    const found = findObjectWithKeys(value, keys, depth - 1);
    if (found) return found;
  }
  return null;
}

async function parseHermesBridgeResponseOrRepair(input: {
  task: CreativeTask;
  body: unknown;
  bridgeUrl: string;
  bearerToken: string;
  request: ReturnType<typeof hermesBridgeRequest>;
}): Promise<CreativeTaskResult> {
  try {
    return parseHermesBridgeResponse(input.task, input.body);
  } catch (error) {
    const raw = rawBridgeResponseText(input.body);
    if (!raw) throw error;
    const repaired = await repairHermesJsonResponse({
      task: input.task,
      rawResponse: raw,
      bridgeUrl: input.bridgeUrl,
      bearerToken: input.bearerToken,
      originalPrompt: input.request.prompt
    });
    return parseHermesBridgeResponse(input.task, repaired);
  }
}

function parseBridgeJsonPayload(body: unknown): unknown {
  if (typeof body === "string") return parsePossiblyFencedJson(body);
  const text =
    stringProperty(body, "output_text") ||
    stringProperty(body, "response") ||
    bridgeChatResponseText(body) ||
    stringProperty(body, "text") ||
    stringProperty(body, "content") ||
    stringProperty(body, "message") ||
    stringProperty(objectProperty(body, "result"), "text") ||
    stringProperty(objectProperty(body, "result"), "content");
  if (text) return parsePossiblyFencedJson(text);
  return objectProperty(body, "response") || objectProperty(body, "result") || objectProperty(body, "data") || body;
}

function bridgeChatResponseText(body: unknown): string | undefined {
  const response = objectProperty(body, "response");
  const top = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const choices = response && Array.isArray(response.choices) ? response.choices : top && Array.isArray(top.choices) ? top.choices : null;
  const first = choices?.[0];
  if (!first || typeof first !== "object") return undefined;
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return undefined;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}

function rawBridgeResponseText(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  return (
    stringProperty(body, "response") ||
    bridgeChatResponseText(body) ||
    stringProperty(body, "output_text") ||
    stringProperty(body, "text") ||
    stringProperty(body, "content") ||
    stringProperty(body, "message") ||
    stringProperty(objectProperty(body, "result"), "text") ||
    stringProperty(objectProperty(body, "result"), "content")
  );
}

async function repairHermesJsonResponse(input: {
  task: CreativeTask;
  rawResponse: string;
  bridgeUrl: string;
  bearerToken: string;
  originalPrompt: string;
}) {
  const promptPath = process.env.HERMES_REPAIR_PATH || "/v1/prompt";
  const endpoint = `${input.bridgeUrl}${promptPath.startsWith("/") ? promptPath : `/${promptPath}`}`;
  const prompt = [
    "You are Hermes in JSON repair mode for DropLink.",
    "",
    "The Hermes agent already did the creative/research work, but its response was not valid machine JSON.",
    "Convert the agent output into the exact JSON required by the original DropLink schema contract.",
    "Preserve the agent's intent and any concrete observations. Use the original prompt only to fill schema-required fields and keep the result grounded.",
    "Return only valid JSON. Do not include Markdown, commentary, apologies, or code fences.",
    "",
    `Task type: ${input.task.type}`,
    "",
    "ORIGINAL DROPLINK CONTRACT AND SOURCE PROMPT:",
    input.originalPrompt,
    "",
    "HERMES AGENT OUTPUT TO STRUCTURE:",
    input.rawResponse.slice(0, 12000)
  ].join("\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.bearerToken}`
    },
    body: JSON.stringify(
      hermesBridgeHttpBody(endpoint, {
        mode: "chat",
        prompt,
        max_tokens: Number(process.env.HERMES_REPAIR_MAX_TOKENS || process.env.HERMES_BRIDGE_MAX_TOKENS || 3500),
        temperature: 0
      })
    )
  });
  const body = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }));
  if (!response.ok) throw new Error(`Hermes JSON repair returned ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

function parsePossiblyFencedJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) throw new Error("Hermes bridge response did not include JSON.");
    return JSON.parse(objectMatch[0]);
  }
}

function objectProperty(input: unknown, key: string): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringProperty(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function bridgeModelVersion(body: unknown) {
  return stringProperty(body, "modelVersion") || stringProperty(body, "model") || stringProperty(objectProperty(body, "response"), "model") || "hermes_bridge";
}

export async function callHermesForCreativeTask(task: CreativeTask): Promise<CreativeTaskResult> {
  if (process.env.DROPLINK_AGENT_RUNTIME === "hermes_cli") {
    return runHermesCliSkillTask(task);
  }
  if (process.env.DROPLINK_REQUIRE_AGENTIC_GENERATION !== "false") {
    throw new Error("DropLink generation requires DROPLINK_AGENT_RUNTIME=hermes_cli so the droplink skill is loaded. Refusing non-agentic fallback.");
  }
  const mode = process.env.HERMES_MODE || "openai";
  if (mode === "agent") {
    try {
      return await runHermesBridgeTask(task);
    } catch (error) {
      if (process.env.HERMES_AGENT_FALLBACK === "false") throw error;
      console.warn(
        `Hermes bridge creative task failed; falling back to structured provider: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }
  if (task.type === "study_brand") {
    const result = await runBrandStudy(task.input);
    return { type: "study_brand", ...result };
  }
  if (task.type === "plan_relics") {
    const result = await runRelicPlanning(task.input);
    return { type: "plan_relics", ...result };
  }
  const result = await runRelicCritique(task.input);
  return { type: "critique_relics", ...result };
}

async function runHermesCliSkillTask(task: CreativeTask): Promise<CreativeTaskResult> {
  const request = hermesBridgeRequest(task);
  const hermesBin = process.env.HERMES_CLI_BIN || "hermes";
  const timeout = Math.max(30_000, Number(process.env.HERMES_CLI_TIMEOUT_MS || process.env.HERMES_BRIDGE_TIMEOUT_MS || 900_000));
  const skill = process.env.DROPLINK_AGENT_SKILL || "droplink";
  return loggedExternalCall(
    { provider: "hermes_cli", operation: task.type, traceId: task.input.traceId, requestId: task.input.requestId },
    async () => {
      const { stdout, stderr } = await execFile(
        hermesBin,
        ["--skills", skill, "chat", "-q", request.prompt],
        {
          timeout,
          maxBuffer: Number(process.env.HERMES_CLI_MAX_BUFFER || 2_000_000),
          cwd: process.cwd(),
          env: { ...process.env, HERMES_DROPLINK_AGENT_JOB: task.type }
        }
      );
      const output = `${stdout || ""}\n${stderr || ""}`.trim();
      return parseHermesBridgeResponseOrRepair({
        task,
        body: output,
        bridgeUrl: (process.env.HERMES_BRIDGE_URL || "http://127.0.0.1:8891").replace(/\/$/, ""),
        bearerToken: process.env.HERMES_BRIDGE_TOKEN || process.env.HERMES_AGENT_TOKEN || "hermes-cli",
        request
      });
    }
  );
}

async function runHermesBridgeTask(task: CreativeTask): Promise<CreativeTaskResult> {
  const bridgeUrl = (process.env.HERMES_BRIDGE_URL || "https://hermes.anky.app").replace(/\/$/, "");
  const configuredBridgePath = process.env.HERMES_BRIDGE_PATH || "/v1/prompt";
  const bridgePath = configuredBridgePath === "/prompt" ? "/v1/prompt" : configuredBridgePath;
  const endpoint = `${bridgeUrl}${bridgePath.startsWith("/") ? bridgePath : `/${bridgePath}`}`;
  const bearerToken = process.env.HERMES_BRIDGE_TOKEN || process.env.HERMES_AGENT_TOKEN;
  if (!bearerToken) throw new Error("HERMES_BRIDGE_TOKEN is required when HERMES_MODE=agent.");
  const request = hermesBridgeRequest(task);
  const timeoutMs = Math.max(5_000, Number(process.env.HERMES_BRIDGE_TIMEOUT_MS || 900_000));
  if (request.mode === "agent" && process.env.HERMES_BRIDGE_USE_TASKS !== "false") {
    return runHermesBridgeAsyncTask({ task, bridgeUrl, bearerToken, request, timeoutMs });
  }
  return loggedExternalCall(
    { provider: "hermes_bridge", operation: task.type, traceId: task.input.traceId, requestId: task.input.requestId },
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${bearerToken}`
          },
          body: JSON.stringify(hermesBridgeHttpBody(endpoint, request)),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Hermes bridge returned ${response.status}: ${await response.text()}`);
        const body = await response.json();
        return parseHermesBridgeResponseOrRepair({ task, body, bridgeUrl, bearerToken, request });
      } finally {
        clearTimeout(timeout);
      }
    }
  );
}

async function runHermesBridgeAsyncTask(input: {
  task: CreativeTask;
  bridgeUrl: string;
  bearerToken: string;
  request: ReturnType<typeof hermesBridgeRequest>;
  timeoutMs: number;
}): Promise<CreativeTaskResult> {
  const taskPath = process.env.HERMES_TASKS_PATH || "/v1/tasks";
  const endpoint = `${input.bridgeUrl}${taskPath.startsWith("/") ? taskPath : `/${taskPath}`}`;
  const pollIntervalMs = Math.max(1_000, Number(process.env.HERMES_TASK_POLL_INTERVAL_MS || 5_000));
  const idempotencyKey = hermesTaskIdempotencyKey(input.task, input.request);
  return loggedExternalCall(
    { provider: "hermes_bridge", operation: `${input.task.type}.task`, traceId: input.task.input.traceId, requestId: input.task.input.requestId },
    async () => {
      const started = Date.now();
      const submit = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.bearerToken}`,
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify(hermesBridgeHttpBody(endpoint, input.request))
      });
      const submitBody = await submit.json().catch(async () => ({ error: await submit.text().catch(() => "") }));
      if (!submit.ok) throw new Error(`Hermes task submit returned ${submit.status}: ${JSON.stringify(submitBody).slice(0, 500)}`);
      const taskId = stringProperty(submitBody, "task_id");
      if (!taskId) {
        if (stringProperty(submitBody, "status") === "done") {
          return parseHermesBridgeResponseOrRepair({
            task: input.task,
            body: submitBody,
            bridgeUrl: input.bridgeUrl,
            bearerToken: input.bearerToken,
            request: input.request
          });
        }
        throw new Error(`Hermes task submit did not return task_id: ${JSON.stringify(submitBody).slice(0, 500)}`);
      }
      while (Date.now() - started < input.timeoutMs) {
        await sleep(pollIntervalMs);
        const poll = await fetch(`${endpoint}/${encodeURIComponent(taskId)}`, {
          headers: { authorization: `Bearer ${input.bearerToken}` }
        });
        const body = await poll.json().catch(async () => ({ error: await poll.text().catch(() => "") }));
        if (!poll.ok) throw new Error(`Hermes task poll returned ${poll.status}: ${JSON.stringify(body).slice(0, 500)}`);
        const status = stringProperty(body, "status");
        if (status === "done") {
          return parseHermesBridgeResponseOrRepair({
            task: input.task,
            body,
            bridgeUrl: input.bridgeUrl,
            bearerToken: input.bearerToken,
            request: input.request
          });
        }
        if (status === "error" || status === "failed") {
          throw new Error(`Hermes task ${taskId} failed: ${stringProperty(body, "error") || JSON.stringify(body).slice(0, 500)}`);
        }
      }
      throw new Error(`Hermes task timed out after ${input.timeoutMs}ms: ${taskId}`);
    }
  );
}

function hermesBridgeHttpBody(endpoint: string, request: ReturnType<typeof hermesBridgeRequest> | { mode: string; prompt: string; max_tokens: number; temperature?: number }) {
  if (endpoint.endsWith("/v1/chat/completions") || endpoint.endsWith("/chat/completions")) {
    return {
      model: process.env.HERMES_BRIDGE_MODEL || "qwen3.6-27b-q4_k_m.gguf",
      messages: [{ role: "user", content: request.prompt }],
      max_tokens: request.max_tokens,
      temperature: "temperature" in request && request.temperature != null ? request.temperature : 0
    };
  }
  return request;
}

function hermesTaskIdempotencyKey(task: CreativeTask, request: ReturnType<typeof hermesBridgeRequest>) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ type: task.type, traceId: task.input.traceId, prompt: request.prompt }))
    .digest("hex")
    .slice(0, 32);
  return `droplink-${task.input.traceId}-${task.type}-${digest}`.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 180);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function studyBrand(input: BrandStudyInput): Promise<{ study: BrandStudyJson; modelVersion: string }> {
  const result = await callHermesForCreativeTask({ type: "study_brand", input });
  if (result.type !== "study_brand") throw new Error("Unexpected Hermes task result for brand study.");
  return { study: result.study, modelVersion: result.modelVersion };
}

export async function planRelics(input: PlanRelicsInput): Promise<{ plan: RelicPlanJson; modelVersion: string }> {
  const result = await callHermesForCreativeTask({ type: "plan_relics", input });
  if (result.type !== "plan_relics") throw new Error("Unexpected Hermes task result for relic planning.");
  return { plan: result.plan, modelVersion: result.modelVersion };
}

export async function critiqueAndRefineRelics(
  study: BrandStudyJson,
  initialPlan: RelicPlanJson,
  input: Omit<CritiqueRelicsInput, "study" | "initialPlan"> = { traceId: "unknown" }
): Promise<{ plan: RelicPlanJson; critique: string; modelVersion: string }> {
  const result = await callHermesForCreativeTask({
    type: "critique_relics",
    input: { ...input, study, initialPlan }
  });
  if (result.type !== "critique_relics") throw new Error("Unexpected Hermes task result for relic critique.");
  return { plan: result.plan, critique: result.critique, modelVersion: result.modelVersion };
}

async function runBrandStudy(input: BrandStudyInput): Promise<{ study: BrandStudyJson; modelVersion: string }> {
  const provider = process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock");
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return loggedExternalCall(
      { provider: "openai", operation: "brand_study", traceId: input.traceId, requestId: input.requestId },
      async () => {
        const model = process.env.OPENAI_MODEL || "gpt-5.5";
        const text = await openAiJson({
          model,
          schemaName: "droplink_brand_study",
          schema: brandStudyJsonSchema(),
          prompt: brandStudyPrompt(input)
        });
        return { study: validateBrandStudy(JSON.parse(text)), modelVersion: model };
      }
    );
  }
  return { study: mockBrandStudy(input), modelVersion: "mock" };
}

async function runRelicPlanning(input: PlanRelicsInput): Promise<{ plan: RelicPlanJson; modelVersion: string }> {
  const provider = process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock");
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return loggedExternalCall(
      { provider: "openai", operation: "relic_plan", traceId: input.traceId, requestId: input.requestId },
      async () => {
        const model = process.env.OPENAI_MODEL || "gpt-5.5";
        const catalogOptions = input.printfulCatalogOptions?.length ? input.printfulCatalogOptions : defaultCatalogOptions;
        const text = await openAiJson({
          model,
          schemaName: "droplink_relic_plan",
          schema: relicPlanJsonSchema(input.relicCount, catalogOptions.map((entry) => entry.key)),
          prompt: relicPlanPrompt(input, catalogOptions)
        });
        return { plan: validateRelicPlan(JSON.parse(text), input.relicCount), modelVersion: model };
      }
    );
  }
  return { plan: mockRelicPlan(input.study, input.relicCount, input.collectionType), modelVersion: "mock" };
}

async function runRelicCritique(input: CritiqueRelicsInput): Promise<{ plan: RelicPlanJson; critique: string; modelVersion: string }> {
  const provider = process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock");
  const relicCount = input.relicCount || 3;
  const catalogOptions = input.printfulCatalogOptions?.length ? input.printfulCatalogOptions : defaultCatalogOptions;
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return loggedExternalCall(
      { provider: "openai", operation: "relic_critique", traceId: input.traceId, requestId: input.requestId },
      async () => {
        const model = process.env.OPENAI_MODEL || "gpt-5.5";
        const text = await openAiJson({
          model,
          schemaName: "droplink_relic_critique",
          schema: relicCritiqueJsonSchema(relicCount, catalogOptions.map((entry) => entry.key)),
          prompt: relicCritiquePrompt(input, catalogOptions)
        });
        const parsed = validateRelicCritique(JSON.parse(text), relicCount);
        return { plan: parsed.refined_plan, critique: parsed.critique_text, modelVersion: model };
      }
    );
  }
  return {
    plan: validateRelicPlan(input.initialPlan, relicCount),
    critique: "Mock critique: plan retained. Cohesion, brand fidelity, and emotional clarity are assumed acceptable in mock mode.",
    modelVersion: "mock"
  };
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
      "archetype",
      "invocation",
      "essence",
      "hidden_world",
      "buyer_role",
      "emotional_contract",
      "worldview",
      "emotional_posture",
      "visual_dna",
      "drop_narrative_seed",
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
      archetype: { type: "string" },
      invocation: { type: "string" },
      essence: { type: "string" },
      hidden_world: { type: "string" },
      buyer_role: { type: "string" },
      emotional_contract: { type: "string" },
      worldview: { type: "string" },
      emotional_posture: { type: "string" },
      visual_dna: {
        type: "object",
        additionalProperties: false,
        required: ["core_shapes", "material_feel", "composition_rules", "signature_gesture"],
        properties: {
          core_shapes: { type: "array", minItems: 2, items: { type: "string" } },
          material_feel: { type: "string" },
          composition_rules: { type: "array", minItems: 2, items: { type: "string" } },
          signature_gesture: { type: "string" }
        }
      },
      drop_narrative_seed: { type: "string" },
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

function relicPlanJsonSchema(relicCount: 3 | 8, printfulProductKeys: string[] = []) {
  const printfulProductKeySchema =
    printfulProductKeys.length > 0 ? { type: "string", enum: printfulProductKeys } : { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["collection_title", "collection_subtitle", "drop_concept", "drop_lore", "relics"],
    properties: {
      collection_title: { type: "string" },
      collection_subtitle: { type: "string" },
      drop_concept: { type: "string" },
      drop_lore: { type: "string" },
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
            "universal_slot",
            "story_role",
            "role_in_triptych",
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
            universal_slot: { type: "string", enum: ["WEAR", "DISPLAY", "USE"] },
            story_role: { type: "string" },
            role_in_triptych: { type: "string" },
            physical_archetype: { type: "string", enum: ["garment", "poster", "tote", "sticker", "hat", "print", "other"] },
            product_family: { type: "string" },
            description: { type: "string" },
            why_this_exists: { type: "string" },
            art_direction: { type: "string" },
            suggested_price_cents: { type: "integer", minimum: 1200 },
            printful_product_key: printfulProductKeySchema
          }
        }
      }
    }
  };
}

function relicCritiqueJsonSchema(relicCount: 3 | 8, printfulProductKeys: string[] = []) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["critique_text", "refined_plan"],
    properties: {
      critique_text: { type: "string" },
      refined_plan: relicPlanJsonSchema(relicCount, printfulProductKeys)
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
    archetype: "the signal keeper",
    invocation: [
      `${brandName} arrives like a small public ritual for people who prefer evidence over noise. It does not beg for attention; it leaves marks that a builder, collector, or early believer can recognize later as proof that they were present when the signal was still forming.`,
      `The brand feels like a threshold between raw internet momentum and something more deliberate. Its posture is precise, strange, optimistic, and builder-native. It cares about the moment when a loose idea becomes a shared object, when a link stops being disposable and starts behaving like a place people can gather around.`,
      `As a living character, ${brandName} is a keeper of portable proof. It carries diagrams, fragments, charged phrases, and visual tokens in its pockets. It likes clean contrast, compressed symbols, and artifacts that seem recovered from a future launch archive. It dislikes cheap hype, counterfeit authority, and merch that only repeats a name without adding meaning.`,
      `A finite release for ${brandName} should feel like three objects from the same ceremony: a mark worn on the body, a signal held in the hand, and a witness placed on the wall. Each piece should make the run feel intentional, as if only a few people can hold a physical shard of the brand's current myth before it changes form.`
    ].join(" "),
    essence,
    hidden_world: `${brandName} opens a compact world where public links become proof-of-belonging objects instead of passing noise.`,
    buyer_role: "early signal keeper",
    emotional_contract: "You were here early enough to carry the signal before it became obvious.",
    worldview: `${brandName} believes useful things should feel alive, memorable, and worth sharing.`,
    emotional_posture: "precise, strange, optimistic, and builder-native",
    visual_dna: {
      core_shapes: ["signal rings", "threshold frames", "small proof glyphs"],
      material_feel: "matte black ink, sharp registration, archival paper, and utilitarian cotton",
      composition_rules: ["center one charged symbol with generous negative space", "pair hard geometry with one human-scale phrase"],
      signature_gesture: "a small threshold mark that looks like a link becoming an artifact"
    },
    drop_narrative_seed: "A three-part ceremony for turning a public link into proof of presence: body, carrier, witness.",
    aesthetic_motifs: ["signal marks", "threshold diagrams", "portable rituals"],
    color_palette: ["#111111", "#ff4f2e", "#f5d36b", "#58a6ff"],
    language_style: "short, charged, internet-native phrases with clear nouns",
    what_they_care_about: ["creative leverage", "community proof", "shipping visible work"],
    what_they_bring_to_the_world: `${brandName} gives people a sharper way to recognize and gather around its idea.`,
    things_to_avoid: ["counterfeit logos", "generic startup merch", "private claims", "celebrity likenesses"],
    product_strategy_notes: "Make artifacts that feel like proof of belonging, not branded swag."
  });
}

function mockRelicPlan(study: BrandStudyJson, relicCount: 3, _collectionType: "drop"): RelicPlanJson {
  const families = ["heavyweight tee", "tote bag", "poster", "notebook", "mug", "framed poster", "laptop sleeve", "heavyweight hoodie"];
  const archetypes = ["body", "carry", "wall", "desk", "drink", "display", "tool", "garment"];
  const relics = Array.from({ length: relicCount }, (_, index) => {
    const family = families[index % families.length];
    const archetype = archetypes[index % archetypes.length];
    const slots = ["WEAR", "USE", "DISPLAY"] as const;
    const roles = ["threshold", "instrument", "witness"];
    return {
      name: index === 0 ? `${study.brand_name} Genesis Signal` : `${study.brand_name} ${archetype[0].toUpperCase()}${archetype.slice(1)} ${index + 1}`,
      archetype,
      universal_slot: slots[index % slots.length],
      story_role: roles[index % roles.length],
      role_in_triptych: `${slots[index % slots.length]} / ${roles[index % roles.length]}`,
      physical_archetype: family.includes("tee") || family.includes("hoodie") ? "garment" : family.includes("poster") ? "poster" : family.includes("tote") ? "tote" : "other",
      product_family: family,
      description: `A limited ${family} carrying the ${study.essence.slice(0, 86)} signal.`,
      why_this_exists: `This exists because ${study.brand_name} brought ${study.what_they_bring_to_the_world.slice(0, 140)}.`,
      art_direction: `${study.aesthetic_motifs.join(", ")} using ${study.color_palette.join(", ")}; avoid exact logos.`,
      suggested_price_cents: family.includes("hoodie") ? 7600 : family.includes("poster") ? 3800 : 5200,
      printful_product_key: family
    };
  });
  return validateRelicPlan(
    {
      collection_title: `${study.brand_name} Artifacts`,
      collection_subtitle: "a finite brand release",
      drop_concept: `${study.brand_name} turns a public signal into three linked artifacts of presence.`,
      drop_lore: `${study.brand_name} leaves behind a finite set: one object to wear, one to carry, and one to witness the signal from the wall.`,
      relics
    },
    relicCount
  );
}
