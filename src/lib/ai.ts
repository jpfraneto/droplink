import { defaultProductMix, productCatalog } from "./productCatalog";
import type { DropCapsule } from "./types";

type BrandInput = {
  url: string;
  domain: string;
  title: string;
  description: string;
  textSample: string;
};

function cleanName(input: string, fallback: string): string {
  const stripped = input
    .replace(/\s*[|-]\s*(home|official site|homepage).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length >= 2 && stripped.length <= 50) return stripped;
  return fallback
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function keyword(text: string, fallback: string): string {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 4 && !["about", "their", "there", "with", "from", "that", "this", "have", "your"].includes(term));
  return terms[0] || fallback;
}

export async function createCapsuleFromScrape(input: BrandInput): Promise<DropCapsule> {
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    try {
      return await createOpenAICapsule(input);
    } catch (error) {
      console.warn("OpenAI capsule generation failed; falling back to mock provider.", error);
    }
  }

  return createMockCapsuleFromScrape(input);
}

function createMockCapsuleFromScrape(input: BrandInput): DropCapsule {
  const brandName = cleanName(input.title, input.domain);
  const rawSummary = input.description || input.textSample.slice(0, 180);
  const summary =
    rawSummary.trim().length >= 24
      ? rawSummary.trim()
      : `${brandName} is a public web project with a distinct internet presence and enough lore to become a focused merch drop.`;
  const theme = keyword(`${input.description} ${input.textSample}`, "operator");
  const visualDirection = `Clean product mockups inspired by ${brandName}: bold type, simple icon-like symbols, high-contrast layouts, and no unauthorized exact logos.`;
  const productTypes = defaultProductMix;
  const productNames = [
    `The ${theme[0].toUpperCase()}${theme.slice(1)} Tee`,
    `${brandName} Operator Hoodie`,
    `The ${brandName} Lore Poster`
  ];

  return {
    protocol: "droplink.drop_capsule",
    version: "0.1",
    source: {
      type: "url",
      url: input.url,
      domain: input.domain,
      title: input.title
    },
    project: {
      name: brandName,
      one_liner: summary.slice(0, 160),
      brand_summary: summary,
      audience: `Fans, builders, customers, and internet-native supporters of ${brandName}.`,
      voice: ["direct", "memeable", "builder-native"],
      forbidden_vibes: ["counterfeit logo merch", "generic AI merch", "celebrity likenesses"]
    },
    drop: {
      collection_name: `The ${brandName} Drop`,
      collection_tagline: "this link became a drop.",
      visual_direction: visualDirection,
      products: productTypes.map((type, index) => ({
        name: productNames[index],
        type,
        description:
          index === 0
            ? `A sharp everyday ${type} for people who found the signal in ${brandName}.`
            : index === 1
              ? `A heavyweight ${type} for operators carrying the ${brandName} energy offline.`
              : `A clean ${type} that turns the ${brandName} story into wall-worthy lore.`,
        why_this_product:
          index === 0
            ? "The tee is the fastest way to make the link wearable and shareable."
            : index === 1
              ? "The hoodie gives the drop a premium builder uniform without needing exact brand marks."
              : "The poster makes the project lore visible without pretending to be official brand merchandise.",
        price_cents: productCatalog[type],
        currency: "usd",
        image_prompt: `${visualDirection} Product type: ${type}. Product name: ${productNames[index]}.`
      })) as DropCapsule["drop"]["products"]
    },
    commerce: {
      platform_fee_bps: Number(process.env.DROPLINK_PLATFORM_FEE_BPS || 800),
      requires_claim_for_live_sales: true
    },
    approval: {
      status: "preview",
      approved_by: null
    }
  };
}

async function createOpenAICapsule(input: BrandInput): Promise<DropCapsule> {
  const prompt = [
    "Generate a DropLink Drop Capsule from this public page context.",
    "Rules: exactly 3 products; preview status only; platform fee 800 bps; no unauthorized exact logos; no secrets; no private data.",
    `URL: ${input.url}`,
    `Domain: ${input.domain}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Visible text sample: ${input.textSample.slice(0, 1600)}`
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: prompt,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "drop_capsule",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["protocol", "version", "source", "project", "drop", "commerce", "approval"],
            properties: {
              protocol: { type: "string", enum: ["droplink.drop_capsule"] },
              version: { type: "string" },
              source: {
                type: "object",
                additionalProperties: false,
                required: ["type", "url", "domain", "title"],
                properties: {
                  type: { type: "string", enum: ["url"] },
                  url: { type: "string" },
                  domain: { type: "string" },
                  title: { type: "string" }
                }
              },
              project: {
                type: "object",
                additionalProperties: false,
                required: ["name", "one_liner", "brand_summary", "audience", "voice", "forbidden_vibes"],
                properties: {
                  name: { type: "string" },
                  one_liner: { type: "string" },
                  brand_summary: { type: "string" },
                  audience: { type: "string" },
                  voice: { type: "array", items: { type: "string" } },
                  forbidden_vibes: { type: "array", items: { type: "string" } }
                }
              },
              drop: {
                type: "object",
                additionalProperties: false,
                required: ["collection_name", "collection_tagline", "visual_direction", "products"],
                properties: {
                  collection_name: { type: "string" },
                  collection_tagline: { type: "string" },
                  visual_direction: { type: "string" },
                  products: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "name",
                        "type",
                        "description",
                        "why_this_product",
                        "price_cents",
                        "currency",
                        "image_prompt"
                      ],
                      properties: {
                        name: { type: "string" },
                        type: { type: "string" },
                        description: { type: "string" },
                        why_this_product: { type: "string" },
                        price_cents: { type: "number" },
                        currency: { type: "string" },
                        image_prompt: { type: "string" }
                      }
                    }
                  }
                }
              },
              commerce: {
                type: "object",
                additionalProperties: false,
                required: ["platform_fee_bps", "requires_claim_for_live_sales"],
                properties: {
                  platform_fee_bps: { type: "number" },
                  requires_claim_for_live_sales: { type: "boolean" }
                }
              },
              approval: {
                type: "object",
                additionalProperties: false,
                required: ["status", "approved_by"],
                properties: {
                  status: { type: "string", enum: ["preview"] },
                  approved_by: { type: ["string", "null"] }
                }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  }

  const json = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text =
    json.output_text ||
    json.output?.flatMap((item) => item.content || []).find((content) => typeof content.text === "string")?.text;
  if (!text) throw new Error("OpenAI response did not include JSON text.");

  return JSON.parse(text) as DropCapsule;
}
