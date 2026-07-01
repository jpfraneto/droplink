import { loggedExternalCall } from "./logger";
import { sql, usePostgres } from "./db";
import type { Relic, RelicFulfillmentSpec, StorefrontBundle } from "./types";

type PrintfulJson = Record<string, unknown>;

export type CatalogProduct = {
  id: number;
  name: string;
  type: string;
  raw: PrintfulJson;
};

export type CatalogVariant = {
  id: number;
  name: string;
  raw: PrintfulJson;
};

type FulfillmentSelectionInput = {
  name: string;
  archetype: string;
  physicalArchetype?: string;
  productFamily: string;
  description: string;
  artDirection: string;
  suggestedPriceCents: number;
  avoidProductCategories?: string[];
  traceId?: string | null;
  requestId?: string | null;
};

export type SelectedPrintfulVariant = {
  product: CatalogProduct;
  variant: CatalogVariant;
  productType: string;
  productCategory: string;
  placement: string;
  technique: string;
  selectionReason: string;
};

type PrintfulRequestOptions = {
  method?: string;
  body?: unknown;
  traceId?: string | null;
  requestId?: string | null;
  operation: string;
  returnNullOn404?: boolean;
};

const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_CACHE_VERSION = "2026-06-24";

function stableNumber(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function productCategory(input: Pick<CatalogProduct, "name" | "type" | "raw"> | { name: string; type?: string; raw?: unknown }) {
  const haystack = `${input.name} ${input.type || ""} ${JSON.stringify(input.raw || {})}`.toLowerCase();
  if (/hoodie|sweatshirt|fleece/.test(haystack)) return "hoodie";
  if (/\b(t-?shirt|shirt|tee)\b/.test(haystack)) return "tee";
  if (/poster|print|canvas|wall art/.test(haystack)) return "poster";
  if (/tote|bag|backpack/.test(haystack)) return "tote";
  if (/hat|cap|beanie/.test(haystack)) return "hat";
  if (/sticker/.test(haystack)) return "sticker";
  if (/mug|bottle|drink|tumbler/.test(haystack)) return "drinkware";
  if (/notebook|journal/.test(haystack)) return "notebook";
  if (/phone|case/.test(haystack)) return "case";
  return "other";
}

function devPlacement() {
  return [{ placement: "front", technique: "dtg", layers: [{ type: "file" }] }];
}

function devCatalogProducts(): CatalogProduct[] {
  return [
    { id: 900001, name: "Dev Heavyweight T-Shirt", type: "shirt", raw: { placements: devPlacement() } },
    { id: 900002, name: "Dev Fleece Hoodie", type: "hoodie", raw: { placements: devPlacement() } },
    { id: 900003, name: "Dev Canvas Tote Bag", type: "tote bag", raw: { placements: devPlacement() } },
    { id: 900004, name: "Dev Matte Poster", type: "poster print", raw: { placements: devPlacement() } },
    { id: 900005, name: "Dev Structured Cap", type: "hat cap", raw: { placements: [{ placement: "front", technique: "embroidery", layers: [{ type: "file" }] }] } },
    { id: 900006, name: "Dev Stainless Bottle", type: "drink bottle", raw: { placements: devPlacement() } }
  ];
}

function devCatalogVariants(productId: number): CatalogVariant[] {
  const variants: Record<number, CatalogVariant[]> = {
    900001: [{ id: 990001, name: "Black / M", raw: { color: "Black", size: "M" } }],
    900002: [{ id: 990002, name: "Black / M", raw: { color: "Black", size: "M" } }],
    900003: [{ id: 990003, name: "Black / One size", raw: { color: "Black", size: "One size" } }],
    900004: [{ id: 990004, name: "18x24", raw: { size: "18x24" } }],
    900005: [{ id: 990005, name: "Black / One size", raw: { color: "Black", size: "One size" } }],
    900006: [{ id: 990006, name: "Black / 24oz", raw: { color: "Black", size: "24oz" } }]
  };
  return variants[productId] || [{ id: 999999, name: "Black / M", raw: { color: "Black", size: "M" } }];
}

export function allowMocks(): boolean {
  return process.env.ALLOW_MOCKS === "true" || process.env.NODE_ENV !== "production";
}

export function printfulConfigured(): boolean {
  return Boolean(process.env.PRINTFUL_API_KEY && process.env.PRINTFUL_API_BASE && process.env.PRINTFUL_STORE_ID);
}

export function printfulConfirmOrders(): boolean {
  return process.env.PRINTFUL_CONFIRM_ORDERS === "true" && process.env.PRINTFUL_AUTO_CONFIRM_ORDERS === "true";
}

export function assertFulfillmentReady() {
  if (printfulConfigured() || allowMocks()) return;
  throw new Error("PRINTFUL_API_KEY, PRINTFUL_API_BASE, and PRINTFUL_STORE_ID are required for fulfillment.");
}

function apiBase() {
  return (process.env.PRINTFUL_API_BASE || "https://api.printful.com").replace(/\/$/, "").replace(/\/v2$/, "");
}

function apiPath(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${clean}`;
}

function redactPrintfulError(body: unknown) {
  if (!body || typeof body !== "object") return String(body || "");
  const json = JSON.stringify(body);
  return json.length > 500 ? `${json.slice(0, 500)}...` : json;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function printfulRequest<T = PrintfulJson>(path: string, options: PrintfulRequestOptions & { returnNullOn404: true }): Promise<T | null>;
async function printfulRequest<T = PrintfulJson>(path: string, options: PrintfulRequestOptions): Promise<T>;
async function printfulRequest<T = PrintfulJson>(path: string, options: PrintfulRequestOptions): Promise<T | null> {
  if (!process.env.PRINTFUL_API_KEY) throw new Error("PRINTFUL_API_KEY is required.");
  return loggedExternalCall(
    {
      provider: "printful",
      operation: options.operation,
      traceId: options.traceId,
      requestId: options.requestId,
      metadata: { path }
    },
    async () => {
      const response = await fetch(apiPath(path), {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
          "X-PF-Store-Id": String(process.env.PRINTFUL_STORE_ID || "")
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const json = (await response.json().catch(() => ({}))) as T;
      if (response.status === 404 && options.returnNullOn404) return null;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") || 3);
        await sleep(Math.min(Math.max(retryAfter, 3), 15) * 1000);
        const retry = await fetch(apiPath(path), {
          method: options.method || "GET",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
            "X-PF-Store-Id": String(process.env.PRINTFUL_STORE_ID || "")
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        });
        const retryJson = (await retry.json().catch(() => ({}))) as T;
        if (retry.status === 404 && options.returnNullOn404) return null;
        if (!retry.ok) {
          throw new Error(`Printful ${options.operation} failed with ${retry.status}: ${redactPrintfulError(retryJson)}`);
        }
        return retryJson;
      }
      if (!response.ok) {
        throw new Error(`Printful ${options.operation} failed with ${response.status}: ${redactPrintfulError(json)}`);
      }
      return json;
    }
  );
}

function printfulOrderFromJson(json: PrintfulJson | null): PrintfulOrderReference | null {
  const data = (json?.data || {}) as PrintfulJson;
  const id = data.id == null ? "" : String(data.id);
  if (!id) return null;
  const externalId = data.external_id == null ? null : String(data.external_id);
  const status = data.status == null ? null : String(data.status);
  return {
    providerOrderId: id,
    providerExternalId: externalId,
    status,
    responseJson: json || {},
    costsJson: ((data.costs || data.retail_costs || null) as Record<string, unknown> | null) || null
  };
}

export type PrintfulOrderReference = {
  providerOrderId: string;
  providerExternalId?: string | null;
  status?: string | null;
  responseJson: PrintfulJson;
  costsJson?: Record<string, unknown> | null;
};

export async function findPrintfulOrderByExternalId(input: {
  externalId: string;
  traceId?: string | null;
  requestId?: string | null;
}): Promise<PrintfulOrderReference | null> {
  if (!printfulConfigured() && allowMocks()) return null;
  assertFulfillmentReady();
  const lookupId = `@${encodeURIComponent(input.externalId)}`;
  const response = await printfulRequest<PrintfulJson>(`/v2/orders/${lookupId}`, {
    operation: "orders.retrieve_by_external_id",
    traceId: input.traceId,
    requestId: input.requestId,
    returnNullOn404: true
  });
  return printfulOrderFromJson(response);
}

async function getCachedJson(cacheKey: string): Promise<unknown | null> {
  if (!usePostgres()) return null;
  const [row] = await sql()`
    select data_json, synced_at
    from printful_catalog_cache
    where cache_key = ${cacheKey}
    limit 1
  `;
  if (!row) return null;
  const syncedAt = row.synced_at instanceof Date ? row.synced_at.getTime() : new Date(String(row.synced_at)).getTime();
  if (Date.now() - syncedAt > CATALOG_CACHE_TTL_MS) return null;
  return row.data_json;
}

async function setCachedJson(cacheKey: string, dataJson: unknown) {
  if (!usePostgres()) return;
  await sql()`
    insert into printful_catalog_cache (cache_key, data_json, synced_at, created_at, updated_at)
    values (${cacheKey}, ${JSON.stringify(dataJson)}::jsonb, now(), now(), now())
    on conflict (cache_key)
    do update set data_json = excluded.data_json, synced_at = now(), updated_at = now()
  `;
}

async function cachedPrintful<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = await getCachedJson(cacheKey);
  if (cached) return cached as T;
  const fresh = await fetcher();
  await setCachedJson(cacheKey, fresh);
  return fresh;
}

function dataArray(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const value = (json as PrintfulJson).data;
  return Array.isArray(value) ? value : [];
}

function parseCatalogProducts(json: unknown): CatalogProduct[] {
  return dataArray(json)
    .map((entry) => {
      const raw = (entry || {}) as PrintfulJson;
      const id = numericId(raw);
      if (!id) return null;
      return {
        id,
        name: textValue(raw, ["name", "title"], `Printful product ${id}`),
        type: textValue(raw, ["type", "product_type", "category"], ""),
        raw
      };
    })
    .filter(Boolean) as CatalogProduct[];
}

function parseCatalogVariants(json: unknown): CatalogVariant[] {
  return dataArray(json)
    .map((entry) => {
      const raw = (entry || {}) as PrintfulJson;
      const id = numericId(raw);
      if (!id) return null;
      return {
        id,
        name: textValue(raw, ["name", "title", "variant_name"], `Variant ${id}`),
        raw
      };
    })
    .filter(Boolean) as CatalogVariant[];
}

function numericId(input: unknown): number | null {
  const raw =
    typeof input === "object" && input
      ? (input as PrintfulJson).id ?? (input as PrintfulJson).catalog_product_id ?? (input as PrintfulJson).catalog_variant_id
      : input;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function textValue(input: PrintfulJson, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export async function listCatalogProducts(input: { traceId?: string | null; requestId?: string | null } = {}): Promise<CatalogProduct[]> {
  if (!printfulConfigured() && allowMocks()) return devCatalogProducts();
  const cacheKey = `catalog-products:v2:front:worldwide:${CATALOG_CACHE_VERSION}`;
  const path = "/v2/catalog-products?limit=100&offset=0&placements=front&selling_region_name=worldwide";
  const fetchProducts = () =>
    printfulRequest<PrintfulJson>(path, {
      operation: "catalog_products.list",
      traceId: input.traceId,
      requestId: input.requestId
    });
  const json = await cachedPrintful(cacheKey, fetchProducts);
  let products = parseCatalogProducts(json);
  if (!products.length) {
    const fresh = await fetchProducts();
    await setCachedJson(cacheKey, fresh);
    products = parseCatalogProducts(fresh);
  }
  return products;
}

export async function listCatalogVariants(
  productId: number,
  input: { traceId?: string | null; requestId?: string | null } = {}
): Promise<CatalogVariant[]> {
  if (!printfulConfigured() && allowMocks()) return devCatalogVariants(productId);
  const cacheKey = `catalog-variants:v2:${productId}:${CATALOG_CACHE_VERSION}`;
  const path = `/v2/catalog-products/${productId}/catalog-variants?limit=100&offset=0`;
  const fetchVariants = () =>
    printfulRequest<PrintfulJson>(path, {
      operation: "catalog_variants.list",
      traceId: input.traceId,
      requestId: input.requestId
    });
  const json = await cachedPrintful(cacheKey, fetchVariants);
  let variants = parseCatalogVariants(json);
  if (!variants.length) {
    const fresh = await fetchVariants();
    await setCachedJson(cacheKey, fresh);
    variants = parseCatalogVariants(fresh);
  }
  return variants;
}

async function listMockupStyles(
  productId: number,
  input: { traceId?: string | null; requestId?: string | null } = {}
): Promise<Array<{ id: number; name: string; viewName: string; raw: PrintfulJson }>> {
  const json = await cachedPrintful(`mockup-styles:v2:${productId}`, () =>
    printfulRequest<PrintfulJson>(`/v2/catalog-products/${productId}/mockup-styles?limit=100&offset=0`, {
      operation: "mockup_styles.list",
      traceId: input.traceId,
      requestId: input.requestId
    })
  );
  return dataArray(json)
    .map((entry) => {
      const raw = (entry || {}) as PrintfulJson;
      const id = numericId(raw.style_id ?? raw.id);
      if (!id) return null;
      return {
        id,
        name: textValue(raw, ["style_name", "name"], `Style ${id}`),
        viewName: textValue(raw, ["view_name", "display_name"], ""),
        raw
      };
    })
    .filter(Boolean) as Array<{ id: number; name: string; viewName: string; raw: PrintfulJson }>;
}

function selectionText(input: FulfillmentSelectionInput) {
  return `${input.physicalArchetype || ""} ${input.productFamily} ${input.archetype} ${input.name} ${input.description}`.toLowerCase();
}

function targetTerms(input: FulfillmentSelectionInput): string[] {
  const combined = selectionText(input);
  if (/hoodie|sweatshirt/.test(combined)) return ["hoodie", "sweatshirt", "fleece"];
  if (/hat|cap/.test(combined)) return ["hat", "cap"];
  if (/sticker/.test(combined)) return ["sticker"];
  if (/tote|carry|bag/.test(combined)) return ["tote", "bag"];
  if (/poster|postcard|print|wall|shrine|display/.test(combined)) return ["poster", "print", "canvas"];
  if (/mug|drink|bottle|tumbler/.test(combined)) return ["mug", "bottle", "tumbler"];
  if (/notebook|journal/.test(combined)) return ["notebook", "journal"];
  if (/laptop|sleeve|case/.test(combined)) return ["case", "sleeve"];
  if (/shirt|tee|garment|body|wear/.test(combined)) return ["shirt", "tee", "t-shirt"];
  return ["shirt", "tee", "poster", "tote"];
}

function allowedProductCategories(input: FulfillmentSelectionInput): string[] {
  const combined = selectionText(input);
  if (/\bdisplay\b|poster|postcard|print|wall|shrine|canvas/.test(combined)) return ["poster", "sticker"];
  if (/\buse\b|tote|carry|bag|mug|drink|bottle|tumbler|notebook|journal|laptop|sleeve|case/.test(combined)) {
    return ["tote", "drinkware", "notebook", "case"];
  }
  if (/\bwear\b|shirt|tee|hoodie|sweatshirt|hat|cap|garment|body/.test(combined)) return ["tee", "hoodie", "hat"];
  if (input.physicalArchetype === "poster" || input.physicalArchetype === "print" || input.physicalArchetype === "sticker") return ["poster", "sticker"];
  if (input.physicalArchetype === "tote" || input.physicalArchetype === "other") return ["tote", "drinkware", "notebook", "case", "poster"];
  if (input.physicalArchetype === "garment" || input.physicalArchetype === "hat") return ["tee", "hoodie", "hat"];
  return [];
}

function scoreProduct(product: CatalogProduct, terms: string[], avoidProductCategories: string[] = []) {
  const haystack = `${product.name} ${product.type} ${JSON.stringify(product.raw)}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 20;
  if (haystack.includes("front")) score += 6;
  if (haystack.includes("dtg") || haystack.includes("digital")) score += 4;
  if (haystack.includes("embroidery")) score -= 10;
  if (haystack.includes("all-over")) score -= 8;
  if (avoidProductCategories.includes(productCategory(product))) score -= 90;
  return score;
}

function scoreVariant(variant: CatalogVariant, terms: string[]) {
  const haystack = `${variant.name} ${JSON.stringify(variant.raw)}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 5;
  if (/\b(m|medium)\b/.test(haystack)) score += 8;
  if (/\b(black|white|natural)\b/.test(haystack)) score += 5;
  if (/\b(18|24|12|16)\b/.test(haystack)) score += 4;
  if (/unavailable|discontinued|out of stock/.test(haystack)) score -= 50;
  return score;
}

function retailPriceUsd(priceCents: number) {
  return (Math.max(priceCents, 1200) / 100).toFixed(2);
}

function placementSupportsFile(raw: PrintfulJson) {
  const layers = raw.layers;
  return Array.isArray(layers) && layers.some((layer) => (layer as PrintfulJson).type === "file");
}

export function choosePrintablePlacement(product: CatalogProduct): { placement: string; technique: string; reason: string } {
  const placements = Array.isArray(product.raw.placements) ? (product.raw.placements as PrintfulJson[]) : [];
  const filePlacements = placements.filter(placementSupportsFile);
  const candidates = filePlacements.length ? filePlacements : placements;
  const preferred =
    candidates.find((entry) => entry.placement === "front" && entry.technique === "dtg") ||
    candidates.find((entry) => entry.placement === "front" && entry.technique === "dtfilm") ||
    candidates.find((entry) => entry.placement === "front") ||
    candidates.find((entry) => entry.technique === "dtg") ||
    candidates.find((entry) => entry.technique === "dtfilm") ||
    candidates[0];
  const placement = typeof preferred?.placement === "string" && preferred.placement ? preferred.placement : "front";
  const technique = typeof preferred?.technique === "string" && preferred.technique ? preferred.technique : "dtg";
  return {
    placement,
    technique,
    reason: candidates.length ? `Printful placement ${placement}/${technique} is declared by the selected catalog product.` : "Printful placement metadata was missing; using front/dtg fallback."
  };
}

export function buildRelicFulfillmentSpec(input: {
  concept: FulfillmentSelectionInput;
  selection: SelectedPrintfulVariant;
  printFileUrl: string;
  printFileSha256: string;
}): RelicFulfillmentSpec {
  return {
    provider: "printful",
    catalogProductId: input.selection.product.id,
    catalogVariantId: input.selection.variant.id,
    productType: input.selection.productType,
    productCategory: input.selection.productCategory,
    productName: input.selection.product.name,
    variantName: input.selection.variant.name,
    placement: input.selection.placement,
    technique: input.selection.technique,
    printFileUrl: input.printFileUrl,
    printFileSha256: input.printFileSha256,
    retailPriceUsd: retailPriceUsd(input.concept.suggestedPriceCents),
    selectionReason: input.selection.selectionReason,
    rawPrintfulCatalogSnapshotJson: {
      product: input.selection.product.raw,
      variant: input.selection.variant.raw
    }
  };
}

export async function selectPrintfulCatalogVariant(input: FulfillmentSelectionInput): Promise<SelectedPrintfulVariant> {
  assertFulfillmentReady();
  const terms = targetTerms(input);
  const allowedCategories = allowedProductCategories(input);
  const products = await listCatalogProducts(input);
  const categoryFiltered = allowedCategories.length
    ? products.filter((product) => allowedCategories.includes(productCategory(product)))
    : products;
  const candidateProducts = categoryFiltered.length ? categoryFiltered : products;
  const topProducts = candidateProducts
    .map((product) => ({ product, score: scoreProduct(product, terms, input.avoidProductCategories || []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  if (!topProducts.length) throw new Error("Printful catalog returned no products.");

  let best: { product: CatalogProduct; variant: CatalogVariant; score: number } | null = null;
  for (const { product, score } of topProducts) {
    const variants = await listCatalogVariants(product.id, input);
    for (const variant of variants) {
      const total = score + scoreVariant(variant, terms);
      if (!best || total > best.score) best = { product, variant, score: total };
    }
  }
  if (!best) throw new Error("Printful catalog returned no variants for candidate products.");
  const printable = choosePrintablePlacement(best.product);
  return {
    product: best.product,
    variant: best.variant,
    productType: input.physicalArchetype || input.productFamily,
    productCategory: productCategory(best.product),
    placement: printable.placement,
    technique: printable.technique,
    selectionReason: `Selected dynamically from Printful catalog because ${best.product.name} matched ${terms.join(", ")} and ${best.variant.name} is one fixed purchasable variant. ${printable.reason}`
  };
}

export async function printfulCatalogOptionsForPlanning(
  input: { traceId?: string | null; requestId?: string | null } = {}
): Promise<Array<{ key: string; name: string; type: string; placements: string[] }>> {
  assertFulfillmentReady();
  const products = await listCatalogProducts(input);
  const categoryOrder = ["poster", "tee", "tote", "hat", "hoodie", "sticker", "drinkware", "notebook", "case", "other"];
  const categoryOffset = input.traceId ? stableNumber(input.traceId) % categoryOrder.length : 0;
  const rotatedCategories = [...categoryOrder.slice(categoryOffset), ...categoryOrder.slice(0, categoryOffset)];
  const seen = new Set<string>();
  const entries = products
    .map((product) => {
      const haystack = `${product.name} ${product.type}`.toLowerCase();
      const placements = Array.isArray(product.raw.placements)
        ? (product.raw.placements as PrintfulJson[])
            .map((entry) => String(entry.placement || ""))
            .filter(Boolean)
            .slice(0, 4)
        : [];
      const category = productCategory(product);
      return {
        key: product.name,
        name: product.name,
        type: product.type || "product",
        placements: placements.length ? placements : ["front"],
        category,
        rank: stableNumber(`${input.traceId || "droplink"}:${category}:${haystack}`)
      };
    })
    .filter((entry) => {
      const normalized = entry.name.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  const byCategory = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = byCategory.get(entry.category) || [];
    group.push(entry);
    byCategory.set(entry.category, group);
  }
  for (const group of byCategory.values()) group.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const interleaved: typeof entries = [];
  for (let round = 0; interleaved.length < 24 && round < 6; round += 1) {
    for (const category of rotatedCategories) {
      const next = byCategory.get(category)?.[round];
      if (next) interleaved.push(next);
      if (interleaved.length >= 24) break;
    }
  }
  return interleaved.slice(0, 24).map(({ rank: _rank, category: _category, ...entry }) => entry);
}

export async function selectPrintfulFulfillmentSpec(input: FulfillmentSelectionInput & { printFileUrl: string; printFileSha256: string }) {
  const selection = await selectPrintfulCatalogVariant(input);
  return buildRelicFulfillmentSpec({ concept: input, selection, printFileUrl: input.printFileUrl, printFileSha256: input.printFileSha256 });
}

export function buildPrintfulOrderItem(relic: Relic, spec: RelicFulfillmentSpec) {
  return {
    source: "catalog",
    catalog_variant_id: spec.catalogVariantId,
    external_id: relic.id,
    quantity: 1,
    retail_price: spec.retailPriceUsd,
    name: relic.name,
    placements: [
      {
        placement: spec.placement,
        technique: spec.technique,
        print_area_type: "simple",
        layers: [
          {
            type: "file",
            url: spec.printFileUrl,
            position: {
              width: 10,
              height: 10,
              top: 0,
              left: 0
            }
          }
        ]
      }
    ]
  };
}

export async function createPrintfulMockup(input: {
  relic: Relic;
  spec: RelicFulfillmentSpec;
  traceId?: string | null;
  requestId?: string | null;
}) {
  const styles = await listMockupStyles(input.spec.catalogProductId, input);
  const style = styles.find((entry) => /front/i.test(entry.viewName)) || styles[0];
  const body = {
    format: "jpg",
    mockup_width_px: 1000,
    products: [
      {
        source: "catalog",
        ...(style ? { mockup_style_ids: [style.id] } : {}),
        catalog_product_id: input.spec.catalogProductId,
        catalog_variant_ids: [input.spec.catalogVariantId],
        placements: [
          {
            placement: input.spec.placement,
            technique: input.spec.technique,
            print_area_type: "simple",
            layers: [
              {
                type: "file",
                url: input.spec.printFileUrl,
                position: {
                  width: 10,
                  height: 10,
                  top: 0,
                  left: 0
                }
              }
            ]
          }
        ]
      }
    ]
  };
  const created = await printfulRequest<PrintfulJson>("/v2/mockup-tasks", {
    method: "POST",
    operation: "mockup_tasks.create",
    body,
    traceId: input.traceId,
    requestId: input.requestId
  });
  const task = dataArray(created)[0] as PrintfulJson | undefined;
  const taskId = task ? String(task.id || "") : "";
  if (!taskId) throw new Error("Printful did not return a mockup task id.");
  const completed = await pollPrintfulMockupTask(taskId, input);
  return { taskId, result: completed, requestJson: body };
}

export async function pollPrintfulMockupTask(
  taskId: string,
  input: { traceId?: string | null; requestId?: string | null } = {},
  attempts = 4
) {
  let latest: PrintfulJson | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await printfulRequest<PrintfulJson>(`/v2/mockup-tasks?id=${encodeURIComponent(taskId)}`, {
      operation: "mockup_tasks.retrieve",
      traceId: input.traceId,
      requestId: input.requestId
    });
    const task = dataArray(response)[0] as PrintfulJson | undefined;
    latest = task || response;
    if (String(task?.status || "").toLowerCase() === "completed") return latest;
    if (String(task?.status || "").toLowerCase() === "failed") throw new Error(`Printful mockup task failed: ${redactPrintfulError(task)}`);
  }
  return latest;
}

export function mockupUrlsFromTask(task: unknown): string[] {
  if (!task || typeof task !== "object") return [];
  const urls: string[] = [];
  const raw = task as PrintfulJson;
  const variantMockups = raw.catalog_variant_mockups;
  if (Array.isArray(variantMockups)) {
    for (const variant of variantMockups) {
      const mockups = (variant as PrintfulJson).mockups;
      if (!Array.isArray(mockups)) continue;
      for (const mockup of mockups) {
        const url = (mockup as PrintfulJson).mockup_url;
        if (typeof url === "string" && /^https:\/\//i.test(url)) urls.push(url.trim());
      }
    }
  }
  return urls;
}

function shippingCustomerDetails(shippingJson: Record<string, unknown> | null | undefined) {
  const details = (shippingJson?.customerDetails || shippingJson) as PrintfulJson | undefined;
  if (!details) return null;
  const shipping = (details.shipping || {}) as PrintfulJson;
  const address = (details.address || shipping.address) as PrintfulJson | undefined;
  if (!address) return null;
  const name = textValue(details, ["name"], "DropLink Buyer");
  return {
    name,
    email: textValue(details, ["email"], ""),
    address1: textValue(address, ["line1", "address1"]),
    address2: textValue(address, ["line2", "address2"]),
    city: textValue(address, ["city"]),
    state_code: textValue(address, ["state", "state_code"]),
    country_code: textValue(address, ["country", "country_code"], "US"),
    zip: textValue(address, ["postal_code", "zip"])
  };
}

function buildOrderRequest(input: {
  bundle: StorefrontBundle;
  relic: Relic;
  orderId: string;
  shippingJson?: Record<string, unknown> | null;
}) {
  const spec = input.relic.fulfillmentSpecJson;
  if (!spec) throw new Error("Relic is missing a persisted Printful fulfillment spec.");
  const recipient = shippingCustomerDetails(input.shippingJson);
  if (!recipient?.address1 || !recipient.city || !recipient.zip || !recipient.country_code) {
    throw new Error("Cannot create Printful order without a complete Stripe shipping address.");
  }
  return {
    order: {
      external_id: input.orderId,
      recipient
    },
    orderItem: buildPrintfulOrderItem(input.relic, spec)
  };
}

export async function createPrintfulDraftOrder(input: {
  bundle: StorefrontBundle;
  relic: Relic;
  orderId: string;
  customerEmail?: string | null;
  shippingJson?: Record<string, unknown> | null;
  traceId?: string | null;
  requestId?: string | null;
}) {
  assertFulfillmentReady();
  const requestJson = buildOrderRequest(input);

  return loggedExternalCall(
    {
      provider: "printful",
      operation: "orders.create_draft_with_item",
      traceId: input.traceId,
      requestId: input.requestId,
      metadata: {
        orderId: input.orderId,
        relicId: input.relic.id,
        printfulVariantId: input.relic.fulfillmentSpecJson?.catalogVariantId
      }
    },
    async () => {
      const orderResponse = (await printfulRequest<PrintfulJson>("/v2/orders", {
        method: "POST",
        operation: "orders.create",
        body: requestJson.order,
        traceId: input.traceId,
        requestId: input.requestId
      })) as PrintfulJson;
      const printfulOrder = (orderResponse.data || {}) as PrintfulJson;
      const providerOrderId = String(printfulOrder.id || printfulOrder.external_id || "");
      if (!providerOrderId) throw new Error("Printful did not return an order id.");
      const itemResponse = (await printfulRequest<PrintfulJson>(`/v2/orders/${encodeURIComponent(providerOrderId)}/order-items`, {
        method: "POST",
        operation: "orders.order_items.create",
        body: requestJson.orderItem,
        traceId: input.traceId,
        requestId: input.requestId
      })) as PrintfulJson;
      return {
        providerOrderId,
        providerExternalId: input.orderId,
        status: "draft_created" as const,
        requestJson,
        responseJson: { order: orderResponse, orderItem: itemResponse },
        dashboardUrl: null,
        costsJson: (printfulOrder.costs || printfulOrder.retail_costs || null) as Record<string, unknown> | null
      };
    }
  );
}

export async function confirmPrintfulOrder(input: {
  providerOrderId: string;
  force?: boolean;
  traceId?: string | null;
  requestId?: string | null;
}) {
  if (!printfulConfirmOrders()) {
    return {
      status: "draft_created" as const,
      responseJson: { skipped: true, reason: "PRINTFUL_CONFIRM_ORDERS and PRINTFUL_AUTO_CONFIRM_ORDERS are not both true" }
    };
  }
  assertFulfillmentReady();
  return loggedExternalCall(
    { provider: "printful", operation: "orders.confirm", traceId: input.traceId, requestId: input.requestId },
    async () => {
      const responseJson = (await printfulRequest<PrintfulJson>(`/v2/orders/${encodeURIComponent(input.providerOrderId)}/confirmation`, {
        method: "POST",
        operation: "orders.confirm",
        traceId: input.traceId,
        requestId: input.requestId
      })) as PrintfulJson;
      return { status: "confirmed" as const, responseJson };
    }
  );
}
