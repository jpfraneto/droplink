import { z } from "zod";
import type { DropCapsule } from "./types";

const productSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.string().min(2).max(40),
  description: z.string().min(8).max(220),
  why_this_product: z.string().min(8).max(260),
  price_cents: z.number().int().min(100).max(50000),
  currency: z.string().min(3).max(3).default("usd"),
  image_prompt: z.string().min(8).max(600)
});

export const dropCapsuleSchema = z.object({
  protocol: z.literal("droplink.drop_capsule"),
  version: z.string().min(1),
  source: z.object({
    type: z.enum(["url", "agent", "manual"]),
    url: z.string().url().optional(),
    domain: z.string().optional(),
    title: z.string().optional()
  }),
  project: z.object({
    name: z.string().min(2).max(80),
    one_liner: z.string().min(8).max(180),
    brand_summary: z.string().min(16).max(600),
    audience: z.string().min(3).max(180),
    voice: z.array(z.string().min(1).max(40)).min(1).max(8),
    forbidden_vibes: z.array(z.string().min(1).max(80)).max(12)
  }),
  drop: z.object({
    collection_name: z.string().min(2).max(90),
    collection_tagline: z.string().min(4).max(160),
    visual_direction: z.string().min(8).max(360),
    products: z.tuple([productSchema, productSchema, productSchema])
  }),
  commerce: z.object({
    platform_fee_bps: z.number().int().min(0).max(3000).default(800),
    requires_claim_for_live_sales: z.boolean().default(true)
  }),
  approval: z.object({
    status: z.enum(["preview", "claimed", "live"]).default("preview"),
    approved_by: z.string().nullable().default(null)
  })
});

export function validateCapsule(input: unknown): DropCapsule {
  const parsed = dropCapsuleSchema.parse(input);

  const joined = JSON.stringify(parsed).toLowerCase();
  const risky = ["api_key", "secret", "password", "private key", "bearer ", "sk_live_"];
  const found = risky.find((term) => joined.includes(term));
  if (found) {
    throw new Error(`Capsule appears to include private data: ${found}`);
  }

  return parsed as DropCapsule;
}
