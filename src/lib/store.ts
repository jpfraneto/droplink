import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { sql, usePostgres } from "./db";
import { newId } from "./hashes";
import type {
  AdminReview,
  Asset,
  Brand,
  BrandSnapshot,
  BrandStudy,
  CheckoutSession,
  Claim,
  Collection,
  FulfillmentOrder,
  GenerationJob,
  GenerationStep,
  LedgerEntry,
  Mockup,
  OgImage,
  Order,
  Relic,
  RelicEdition,
  RelicPlan,
  StoreData,
  Storefront,
  StorefrontBundle,
  StorefrontTier,
  SystemEvent
} from "./types";

function dataFile() {
  return process.env.DROPLINK_DATA_FILE || path.join(process.cwd(), "data", "store.json");
}

export const emptyStore: StoreData = {
  brands: [],
  storefronts: [],
  collections: [],
  relics: [],
  relicEditions: [],
  assets: [],
  mockups: [],
  ogImages: [],
  brandSnapshots: [],
  brandStudies: [],
  relicPlans: [],
  claims: [],
  checkoutSessions: [],
  orders: [],
  ledgerEntries: [],
  fulfillmentOrders: [],
  stripeAccounts: [],
  subscriptions: [],
  adminReviews: [],
  generationJobs: [],
  systemEvents: []
};

let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function normalizeStore(input: Partial<StoreData>): StoreData {
  return {
    brands: input.brands || [],
    storefronts: input.storefronts || [],
    collections: input.collections || [],
    relics: input.relics || [],
    relicEditions: input.relicEditions || [],
    assets: input.assets || [],
    mockups: input.mockups || [],
    ogImages: input.ogImages || [],
    brandSnapshots: input.brandSnapshots || [],
    brandStudies: input.brandStudies || [],
    relicPlans: input.relicPlans || [],
    claims: input.claims || [],
    checkoutSessions: input.checkoutSessions || [],
    orders: input.orders || [],
    ledgerEntries: input.ledgerEntries || [],
    fulfillmentOrders: input.fulfillmentOrders || [],
    stripeAccounts: input.stripeAccounts || [],
    subscriptions: input.subscriptions || [],
    adminReviews: input.adminReviews || [],
    generationJobs: input.generationJobs || [],
    systemEvents: input.systemEvents || []
  };
}

async function readStore(): Promise<StoreData> {
  try {
    return normalizeStore(JSON.parse(await readFile(dataFile(), "utf8")) as Partial<StoreData>);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return normalizeStore({});
    throw error;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await mkdir(path.dirname(dataFile()), { recursive: true });
  await writeFile(dataFile(), JSON.stringify(data, null, 2), "utf8");
}

async function mutateStore<T>(mutator: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const data = await readStore();
    const result = await mutator(data);
    await writeStore(data);
    return result;
  };
  const next = writeQueue.then(run, run);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function row<T>(value: unknown): T {
  return value as T;
}

function hydrateBundle(data: StoreData, storefront: Storefront): StorefrontBundle | null {
  const brand = data.brands.find((entry) => entry.id === storefront.brandId);
  if (!brand) return null;
  const collections = data.collections
    .filter((entry) => entry.storefrontId === storefront.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeCollection =
    collections.find((entry) => entry.status === "published") ||
    collections.find((entry) => entry.status === "ready_for_review") ||
    collections[0] ||
    null;
  const relics = activeCollection
    ? data.relics.filter((entry) => entry.collectionId === activeCollection.id)
    : [];
  const editions = data.relicEditions.filter((entry) => relics.some((relic) => relic.id === entry.relicId));
  return {
    brand,
    storefront,
    collections,
    activeCollection,
    relics,
    editions,
  assets: data.assets.filter(
      (entry) => entry.collectionId === activeCollection?.id || relics.some((relic) => relic.id === entry.relicId)
    ),
    mockups: data.mockups.filter((entry) => relics.some((relic) => relic.id === entry.relicId)),
    ogImage: activeCollection
      ? data.ogImages.find((entry) => entry.id === activeCollection.ogImageId || entry.collectionId === activeCollection.id) || null
      : null,
    brandStudy: data.brandStudies.find((entry) => entry.storefrontId === storefront.id) || null,
    relicPlan: activeCollection ? data.relicPlans.find((entry) => entry.collectionId === activeCollection.id) || null : null,
    events: data.systemEvents
      .filter(
        (entry) =>
          entry.entityId === storefront.id ||
          entry.entityId === activeCollection?.id ||
          relics.some((relic) => relic.id === entry.entityId)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function existingStorefrontSlugs(): Promise<Set<string>> {
  if (!usePostgres()) {
    const data = await readStore();
    return new Set(data.storefronts.map((entry) => entry.slug));
  }
  const rows = await sql()`select slug from storefronts`;
  return new Set(rows.map((entry) => String(entry.slug)));
}

export async function listStorefrontBundles(): Promise<StorefrontBundle[]> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.storefronts
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((storefront) => hydrateBundle(data, storefront))
      .filter(Boolean) as StorefrontBundle[];
  }
  const rows = await sql()`select * from storefronts order by created_at desc`;
  const bundles = await Promise.all(rows.map((entry) => getStorefrontBundleById(String(entry.id))));
  return bundles.filter(Boolean) as StorefrontBundle[];
}

export async function getGenerationJob(id: string): Promise<GenerationJob | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.generationJobs.find((entry) => entry.id === id) || null;
  }
  const [job] = await sql()`select * from generation_jobs where id = ${id} limit 1`;
  return job ? row<GenerationJob>(toCamel(job)) : null;
}

export async function createGenerationJob(input: {
  id?: string;
  traceId: string;
  type: "genesis" | "weekly";
  inputJson: Record<string, unknown>;
}): Promise<GenerationJob> {
  const job: GenerationJob = {
    id: input.id || newId("job"),
    storefrontId: null,
    collectionId: null,
    traceId: input.traceId,
    type: input.type,
    status: "queued",
    currentStep: "INTAKE_CREATED",
    inputJson: input.inputJson,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.generationJobs.push(job);
    });
    return job;
  }
  await sql()`insert into generation_jobs ${sql()(toSnake(job))}`;
  return job;
}

export async function attachGenerationJobEntities(jobId: string, storefrontId: string, collectionId: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const job = data.generationJobs.find((entry) => entry.id === jobId);
      if (job) {
        job.storefrontId = storefrontId;
        job.collectionId = collectionId;
        job.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql()`
    update generation_jobs
    set storefront_id = ${storefrontId}, collection_id = ${collectionId}, updated_at = now()
    where id = ${jobId}
  `;
}

export async function updateGenerationJobStep(jobId: string, step: GenerationStep, error?: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const job = data.generationJobs.find((entry) => entry.id === jobId);
      if (job) {
        job.currentStep = step;
        job.status = step === "FAILED" ? "failed" : step === "READY_FOR_REVIEW" ? "completed" : "running";
        job.error = error || null;
        job.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql()`
    update generation_jobs
    set current_step = ${step},
        status = ${step === "FAILED" ? "failed" : step === "READY_FOR_REVIEW" ? "completed" : "running"},
        error = ${error || null},
        updated_at = now()
    where id = ${jobId}
  `;
}

export async function getStorefrontBundleBySlug(slug: string): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    const data = await readStore();
    const storefront = data.storefronts.find((entry) => entry.slug === slug || entry.customDomain === slug);
    return storefront ? hydrateBundle(data, storefront) : null;
  }
  const [storefront] = await sql()`select * from storefronts where slug = ${slug} or custom_domain = ${slug} limit 1`;
  return storefront ? getStorefrontBundleById(String(storefront.id)) : null;
}

export async function getStorefrontBundleById(id: string): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    const data = await readStore();
    const storefront = data.storefronts.find((entry) => entry.id === id);
    return storefront ? hydrateBundle(data, storefront) : null;
  }
  const db = sql();
  const [storefrontRow] = await db`select * from storefronts where id = ${id} limit 1`;
  if (!storefrontRow) return null;
  const [brandRow] = await db`select * from brands where id = ${storefrontRow.brand_id} limit 1`;
  const collectionRows = await db`select * from collections where storefront_id = ${id} order by created_at desc`;
  const activeRow =
    collectionRows.find((entry) => entry.status === "published") ||
    collectionRows.find((entry) => entry.status === "ready_for_review") ||
    collectionRows[0];
  const relicRows = activeRow ? await db`select * from relics where collection_id = ${activeRow.id} order by created_at asc` : [];
  const relicIds = relicRows.map((entry) => entry.id);
  const editionRows = relicIds.length
    ? await db`select * from relic_editions where relic_id in ${db(relicIds)} order by edition_number asc`
    : [];
  const assetRows = activeRow
    ? await db`select * from assets where collection_id = ${activeRow.id} or relic_id in ${db(relicIds)}`
    : [];
  const mockupRows = relicIds.length ? await db`select * from mockups where relic_id in ${db(relicIds)}` : [];
  const [ogRow] = activeRow ? await db`select * from og_images where collection_id = ${activeRow.id} limit 1` : [];
  const [studyRow] = await db`select * from brand_studies where storefront_id = ${id} order by created_at desc limit 1`;
  const [planRow] = activeRow ? await db`select * from relic_plans where collection_id = ${activeRow.id} limit 1` : [];
  const eventRows = await db`
    select * from system_events
    where entity_id = ${id}
      ${activeRow ? db`or entity_id = ${activeRow.id}` : db``}
      ${relicIds.length ? db`or entity_id in ${db(relicIds)}` : db``}
    order by created_at desc
    limit 200
  `;
  return {
    brand: row<Brand>(toCamel(brandRow)),
    storefront: row<Storefront>(toCamel(storefrontRow)),
    collections: collectionRows.map((entry) => row<Collection>(toCamel(entry))),
    activeCollection: activeRow ? row<Collection>(toCamel(activeRow)) : null,
    relics: relicRows.map((entry) => row<Relic>(toCamel(entry))),
    editions: editionRows.map((entry) => row<RelicEdition>(toCamel(entry))),
    assets: assetRows.map((entry) => row<Asset>(toCamel(entry))),
    mockups: mockupRows.map((entry) => row<Mockup>(toCamel(entry))),
    ogImage: ogRow ? row<OgImage>(toCamel(ogRow)) : null,
    brandStudy: studyRow ? row<BrandStudy>(toCamel(studyRow)) : null,
    relicPlan: planRow ? row<RelicPlan>(toCamel(planRow)) : null,
    events: eventRows.map((entry) => row<SystemEvent>(toCamel(entry)))
  };
}

function toCamel(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camel] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export async function saveGeneratedBundle(bundle: {
  brand: Brand;
  storefront: Storefront;
  snapshot: BrandSnapshot;
  study: BrandStudy;
  collection: Collection;
  relicPlan: RelicPlan;
  relics: Relic[];
  editions: RelicEdition[];
  assets: Asset[];
  mockups: Mockup[];
  ogImage: OgImage;
  adminReview: AdminReview;
  job: GenerationJob;
}): Promise<StorefrontBundle> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      data.brands.push(bundle.brand);
      data.storefronts.push(bundle.storefront);
      data.brandSnapshots.push(bundle.snapshot);
      data.brandStudies.push(bundle.study);
      data.collections.push(bundle.collection);
      data.relicPlans.push(bundle.relicPlan);
      data.relics.push(...bundle.relics);
      data.relicEditions.push(...bundle.editions);
      data.assets.push(...bundle.assets);
      data.mockups.push(...bundle.mockups);
      data.ogImages.push(bundle.ogImage);
      data.adminReviews.push(bundle.adminReview);
      const existingJob = data.generationJobs.find((entry) => entry.id === bundle.job.id);
      if (existingJob) Object.assign(existingJob, bundle.job);
      else data.generationJobs.push(bundle.job);
      bundle.collection.ogImageId = bundle.ogImage.id;
      const hydrated = hydrateBundle(data, bundle.storefront);
      if (!hydrated) throw new Error("Generated storefront could not be hydrated.");
      return hydrated;
    });
  }

  const db = sql();
  await db.begin(async (tx) => {
    await tx`insert into brands ${tx(toSnake(bundle.brand))}`;
    await tx`insert into storefronts ${tx(toSnake(bundle.storefront))}`;
    await tx`insert into brand_snapshots ${tx(toSnake(bundle.snapshot))}`;
    await tx`insert into brand_studies ${tx(toSnake(bundle.study))}`;
    await tx`insert into collections ${tx(toSnake({ ...bundle.collection, ogImageId: bundle.ogImage.id }))}`;
    await tx`insert into relic_plans ${tx(toSnake(bundle.relicPlan))}`;
    for (const relic of bundle.relics) await tx`insert into relics ${tx(toSnake(relic))}`;
    for (const edition of bundle.editions) await tx`insert into relic_editions ${tx(toSnake(edition))}`;
    for (const asset of bundle.assets) await tx`insert into assets ${tx(toSnake(asset))}`;
    for (const mockup of bundle.mockups) await tx`insert into mockups ${tx(toSnake(mockup))}`;
    await tx`insert into og_images ${tx(toSnake(bundle.ogImage))}`;
    await tx`insert into admin_reviews ${tx(toSnake(bundle.adminReview))}`;
    await tx`
      insert into generation_jobs ${tx(toSnake(bundle.job))}
      on conflict (id) do update
      set storefront_id = excluded.storefront_id,
          collection_id = excluded.collection_id,
          status = excluded.status,
          current_step = excluded.current_step,
          input_json = excluded.input_json,
          error = excluded.error,
          updated_at = excluded.updated_at
    `;
  });
  const hydrated = await getStorefrontBundleById(bundle.storefront.id);
  if (!hydrated) throw new Error("Generated storefront could not be loaded after save.");
  return hydrated;
}

function toSnake(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return out;
}

export async function recordEvent(input: Omit<SystemEvent, "id" | "createdAt">): Promise<SystemEvent> {
  const event: SystemEvent = { id: newId("evt"), createdAt: nowIso(), ...input };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.systemEvents.push(event);
    });
    return event;
  }
  await sql()`insert into system_events ${sql()(toSnake(event))}`;
  return event;
}

export async function updateGenerationStep(storefrontId: string, step: GenerationStep, error?: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      if (storefront) {
        storefront.generationStatus = step;
        storefront.updatedAt = nowIso();
      }
      const job = data.generationJobs.find((entry) => entry.storefrontId === storefrontId);
      if (job) {
        job.currentStep = step;
        job.status = step === "FAILED" ? "failed" : step === "READY_FOR_REVIEW" ? "completed" : "running";
        job.error = error || null;
        job.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`update storefronts set generation_status = ${step}, updated_at = now() where id = ${storefrontId}`;
    await tx`
      update generation_jobs
      set current_step = ${step},
          status = ${step === "FAILED" ? "failed" : step === "READY_FOR_REVIEW" ? "completed" : "running"},
          error = ${error || null},
          updated_at = now()
      where storefront_id = ${storefrontId}
    `;
  });
}

export async function publishStorefront(storefrontId: string): Promise<StorefrontBundle> {
  const bundle = await getStorefrontBundleById(storefrontId);
  if (!bundle || !bundle.activeCollection) throw new Error("Storefront not found.");
  const activeCollection = bundle.activeCollection;
  const readiness = reviewReadiness(bundle);
  if (!readiness.ready) throw new Error(`Storefront is not ready to publish: ${readiness.blockers.join(", ")}`);

  if (!usePostgres()) {
    return mutateStore((data) => {
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      const collection = data.collections.find((entry) => entry.id === bundle.activeCollection?.id);
      if (!storefront || !collection) throw new Error("Storefront not found.");
      storefront.status = "published";
      storefront.commerceMode = storefront.stripeConnectedAccountId ? "connect_checkout" : "platform_checkout";
      storefront.generationStatus = "PUBLISHED";
      storefront.publishedAt = nowIso();
      storefront.updatedAt = nowIso();
      collection.status = "published";
      collection.publishedAt = nowIso();
      data.relics
        .filter((entry) => entry.collectionId === collection.id)
        .forEach((relic) => {
          relic.status = relic.soldCount >= relic.totalSupply ? "sold_out" : "live";
          relic.updatedAt = nowIso();
        });
      const hydrated = hydrateBundle(data, storefront);
      if (!hydrated) throw new Error("Could not hydrate published storefront.");
      return hydrated;
    });
  }

  await sql().begin(async (tx) => {
    await tx`
      update storefronts
      set status = 'published',
          commerce_mode = case when stripe_connected_account_id is null then 'platform_checkout' else 'connect_checkout' end,
          generation_status = 'PUBLISHED',
          published_at = now(),
          updated_at = now()
      where id = ${storefrontId}
    `;
    await tx`update collections set status = 'published', published_at = now() where id = ${activeCollection.id}`;
    await tx`update relics set status = case when sold_count >= total_supply then 'sold_out' else 'live' end, updated_at = now() where collection_id = ${activeCollection.id}`;
  });
  const published = await getStorefrontBundleById(storefrontId);
  if (!published) throw new Error("Published storefront could not be loaded.");
  return published;
}

export async function markStorefrontPremium(storefrontId: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      if (storefront) {
        storefront.tier = "atelier";
        storefront.commissionBps = 0;
        storefront.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql()`update storefronts set tier = 'atelier', commission_bps = 0, updated_at = now() where id = ${storefrontId}`;
}

export function reviewReadiness(bundle: StorefrontBundle): { ready: boolean; blockers: string[]; checklist: Record<string, boolean> } {
  const collection = bundle.activeCollection;
  const relics = bundle.relics;
  const editionsByRelic = new Map<string, number>();
  for (const edition of bundle.editions) editionsByRelic.set(edition.relicId, (editionsByRelic.get(edition.relicId) || 0) + 1);
  const checklist = {
    urlCrawled: Boolean(bundle.brandStudy),
    brandStudyGenerated: Boolean(bundle.brandStudy),
    relicPlanValid: Boolean(bundle.relicPlan && collection && bundle.relicPlan.planJson.relics.length === collection.relicCount),
    printfulVariantSelected: relics.every((relic) => Boolean(relic.printfulProductId && relic.printfulVariantId)),
    printFilesGenerated: relics.every((relic) => bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file")),
    printFilesValid: relics.every((relic) =>
      bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.validationStatus === "valid")
    ),
    mockupsGenerated: relics.every((relic) =>
      bundle.mockups.some((mockup) => mockup.relicId === relic.id && mockup.status === "ready" && /^https:\/\//i.test(mockup.imageUrl) && !mockup.imageUrl.includes("/api/mockups/"))
    ),
    ogGenerated: Boolean(bundle.ogImage),
    editionsCreated: relics.every((relic) => editionsByRelic.get(relic.id) === 8),
    pricesMarginsValid: relics.every((relic) => relic.priceCents >= 1200),
    checkoutReady: process.env.NODE_ENV === "production" ? Boolean(process.env.STRIPE_SECRET_KEY) : true,
    fulfillmentReady: process.env.NODE_ENV === "production" ? Boolean(process.env.PRINTFUL_API_KEY) : true,
    fulfillmentSpecsPersisted: relics.every((relic) =>
      Boolean(relic.fulfillmentSpecJson?.catalogVariantId && relic.fulfillmentSpecJson?.printFileUrl && relic.fulfillmentSpecJson?.printFileSha256)
    ),
    r2StorageReady:
      process.env.NODE_ENV === "production"
        ? process.env.STORAGE_PROVIDER === "r2" &&
          Boolean(
            process.env.R2_ACCOUNT_ID &&
              process.env.R2_ACCESS_KEY_ID &&
              process.env.R2_SECRET_ACCESS_KEY &&
              process.env.R2_BUCKET &&
              (process.env.R2_PUBLIC_BASE_URL || process.env.STORAGE_PUBLIC_BASE_URL)
          )
        : true,
    assetsStoredOnR2: relics.every((relic) =>
      bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.storageProvider === "r2" && /^https:\/\//i.test(asset.url))
    ),
    webpPreviewsGenerated: relics.every((relic) =>
      bundle.assets.some(
        (asset) =>
          asset.relicId === relic.id &&
          asset.type === "preview" &&
          asset.storageProvider === "r2" &&
          asset.url.toLowerCase().includes(".webp")
      )
    ),
    noMockAssets: !bundle.assets.some((asset) => asset.validationStatus === "mock" || asset.url.includes("/api/mockups/")),
    noMockCopy: process.env.NODE_ENV === "production" ? process.env.AI_PROVIDER === "openai" : true
  };
  const blockers = Object.entries(checklist)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return { ready: blockers.length === 0, blockers, checklist };
}

export function isPublicStorefrontReady(bundle: StorefrontBundle): boolean {
  if (bundle.storefront.status !== "published" || !bundle.activeCollection) return false;
  return reviewReadiness(bundle).ready;
}

export async function reserveEditionForRelic(input: {
  relicId: string;
  requestId?: string | null;
  traceId?: string | null;
}): Promise<{ checkout: CheckoutSession; edition: RelicEdition; bundle: StorefrontBundle }> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const checkoutId = newId("chk");
  if (!usePostgres()) {
    return mutateStore((data) => {
      releaseExpiredInMemory(data);
      const relic = data.relics.find((entry) => entry.id === input.relicId);
      if (!relic) throw new Error("Relic not found.");
      const collection = data.collections.find((entry) => entry.id === relic.collectionId);
      const storefront = collection ? data.storefronts.find((entry) => entry.id === collection.storefrontId) : null;
      if (!collection || !storefront || storefront.status !== "published" || collection.status !== "published" || relic.status !== "live") {
        throw new Error("Relic is not available for checkout.");
      }
      const edition = data.relicEditions
        .filter((entry) => entry.relicId === relic.id && entry.status === "available")
        .sort((a, b) => a.editionNumber - b.editionNumber)[0];
      if (!edition) throw new Error("SOLD_OUT");
      edition.status = "reserved";
      edition.checkoutSessionId = checkoutId;
      edition.reservedUntil = expiresAt;
      edition.updatedAt = nowIso();
      relic.reservedCount += 1;
      relic.updatedAt = nowIso();
      const checkout: CheckoutSession = {
        id: checkoutId,
        stripeSessionId: `pending_${checkoutId}`,
        storefrontId: storefront.id,
        collectionId: collection.id,
        relicId: relic.id,
        relicEditionId: edition.id,
        status: "created",
        expiresAt,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      data.checkoutSessions.push(checkout);
      const bundle = hydrateBundle(data, storefront);
      if (!bundle) throw new Error("Storefront could not be hydrated.");
      return { checkout, edition, bundle };
    });
  }

  const db = sql();
  const result = await db.begin(async (tx) => {
    await tx`
      update relic_editions
      set status = 'available', checkout_session_id = null, reserved_until = null, updated_at = now()
      where status = 'reserved' and reserved_until < now()
    `;
    const [relic] = await tx`select * from relics where id = ${input.relicId} for update`;
    if (!relic) throw new Error("Relic not found.");
    const [collection] = await tx`select * from collections where id = ${relic.collection_id}`;
    const [storefront] = await tx`select * from storefronts where id = ${collection.storefront_id}`;
    if (storefront.status !== "published" || collection.status !== "published" || relic.status !== "live") {
      throw new Error("Relic is not available for checkout.");
    }
    const [edition] = await tx`
      select * from relic_editions
      where relic_id = ${input.relicId} and status = 'available'
      order by edition_number asc
      limit 1
      for update skip locked
    `;
    if (!edition) throw new Error("SOLD_OUT");
    await tx`
      update relic_editions
      set status = 'reserved', checkout_session_id = ${checkoutId}, reserved_until = ${expiresAt}, updated_at = now()
      where id = ${edition.id}
    `;
    await tx`update relics set reserved_count = reserved_count + 1, updated_at = now() where id = ${input.relicId}`;
    const checkout: CheckoutSession = {
      id: checkoutId,
      stripeSessionId: `pending_${checkoutId}`,
      storefrontId: String(storefront.id),
      collectionId: String(collection.id),
      relicId: String(relic.id),
      relicEditionId: String(edition.id),
      status: "created",
      expiresAt,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await tx`insert into checkout_sessions ${tx(toSnake(checkout))}`;
    return { checkout, edition: row<RelicEdition>(toCamel(edition)), storefrontId: String(storefront.id) };
  });
  const bundle = await getStorefrontBundleById(result.storefrontId);
  if (!bundle) throw new Error("Storefront could not be hydrated.");
  return { checkout: result.checkout, edition: result.edition, bundle };
}

function releaseExpiredInMemory(data: StoreData) {
  const now = Date.now();
  for (const checkout of data.checkoutSessions) {
    if (checkout.status === "created" && new Date(checkout.expiresAt).getTime() < now) {
      checkout.status = "expired";
      checkout.updatedAt = nowIso();
      const edition = data.relicEditions.find((entry) => entry.id === checkout.relicEditionId);
      const relic = edition ? data.relics.find((entry) => entry.id === edition.relicId) : null;
      if (edition && edition.status === "reserved") {
        edition.status = "available";
        edition.checkoutSessionId = null;
        edition.reservedUntil = null;
        edition.updatedAt = nowIso();
        if (relic) relic.reservedCount = Math.max(0, relic.reservedCount - 1);
      }
    }
  }
}

export async function attachStripeSession(checkoutId: string, stripeSessionId: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const checkout = data.checkoutSessions.find((entry) => entry.id === checkoutId);
      const edition = checkout ? data.relicEditions.find((entry) => entry.id === checkout.relicEditionId) : null;
      if (checkout) {
        checkout.stripeSessionId = stripeSessionId;
        checkout.updatedAt = nowIso();
      }
      if (edition) {
        edition.checkoutSessionId = checkoutId;
        edition.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql()`update checkout_sessions set stripe_session_id = ${stripeSessionId}, updated_at = now() where id = ${checkoutId}`;
}

export async function releaseCheckout(checkoutId: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const checkout = data.checkoutSessions.find((entry) => entry.id === checkoutId);
      if (!checkout || checkout.status !== "created") return;
      checkout.status = "expired";
      checkout.updatedAt = nowIso();
      const edition = data.relicEditions.find((entry) => entry.id === checkout.relicEditionId);
      const relic = edition ? data.relics.find((entry) => entry.id === edition.relicId) : null;
      if (edition && edition.status === "reserved") {
        edition.status = "available";
        edition.checkoutSessionId = null;
        edition.reservedUntil = null;
        edition.updatedAt = nowIso();
        if (relic) {
          relic.reservedCount = Math.max(0, relic.reservedCount - 1);
          relic.updatedAt = nowIso();
        }
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    const [checkout] = await tx`select * from checkout_sessions where id = ${checkoutId} for update`;
    if (!checkout || checkout.status !== "created") return;
    await tx`update checkout_sessions set status = 'expired', updated_at = now() where id = ${checkoutId}`;
    await tx`
      update relic_editions
      set status = 'available', checkout_session_id = null, reserved_until = null, updated_at = now()
      where id = ${checkout.relic_edition_id} and status = 'reserved'
    `;
    await tx`update relics set reserved_count = greatest(0, reserved_count - 1), updated_at = now() where id = ${checkout.relic_id}`;
  });
}

export async function expireCheckoutByStripeSession(stripeSessionId: string): Promise<void> {
  const checkout = await getCheckoutByStripeSession(stripeSessionId);
  if (checkout) await releaseCheckout(checkout.id);
}

export async function getCheckoutByStripeSession(stripeSessionId: string): Promise<CheckoutSession | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.checkoutSessions.find((entry) => entry.stripeSessionId === stripeSessionId) || null;
  }
  const [checkout] = await sql()`select * from checkout_sessions where stripe_session_id = ${stripeSessionId} limit 1`;
  return checkout ? row<CheckoutSession>(toCamel(checkout)) : null;
}

export function ledgerForSale(input: {
  orderId: string;
  amountCents: number;
  currency: string;
  commissionBps: number;
  printfulCostCents?: number;
  printfulShippingCents?: number;
}): LedgerEntry[] {
  const commission = Math.round((input.amountCents * input.commissionBps) / 10000);
  const printfulCost = input.printfulCostCents || 0;
  const printfulShipping = input.printfulShippingCents || 0;
  const brandPayable = input.amountCents - commission - printfulCost - printfulShipping;
  const createdAt = nowIso();
  return [
    { id: newId("led"), orderId: input.orderId, type: "customer_payment", amountCents: input.amountCents, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "droplink_commission", amountCents: commission, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "printful_cost", amountCents: -printfulCost, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "printful_shipping", amountCents: -printfulShipping, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "brand_payable", amountCents: brandPayable, currency: input.currency, createdAt }
  ];
}

export async function completeCheckoutSale(input: {
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  customerEmail?: string | null;
  shippingJson?: Record<string, unknown> | null;
}): Promise<{ order: Order; ledger: LedgerEntry[]; bundle: StorefrontBundle }> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const checkout = data.checkoutSessions.find((entry) => entry.stripeSessionId === input.stripeSessionId);
      if (!checkout) throw new Error("Checkout session not found.");
      if (checkout.status === "completed") {
        const order = data.orders.find((entry) => entry.checkoutSessionId === checkout.id);
        if (!order) throw new Error("Completed checkout is missing order.");
        const storefront = data.storefronts.find((entry) => entry.id === order.storefrontId);
        const bundle = storefront ? hydrateBundle(data, storefront) : null;
        if (!bundle) throw new Error("Storefront not found.");
        return { order, ledger: data.ledgerEntries.filter((entry) => entry.orderId === order.id), bundle };
      }
      const edition = data.relicEditions.find((entry) => entry.id === checkout.relicEditionId);
      const relic = data.relics.find((entry) => entry.id === checkout.relicId);
      const storefront = data.storefronts.find((entry) => entry.id === checkout.storefrontId);
      if (!edition || !relic || !storefront || edition.status !== "reserved") throw new Error("Edition is not reserved.");
      const order: Order = {
        id: newId("ord"),
        checkoutSessionId: checkout.id,
        stripePaymentIntentId: input.stripePaymentIntentId || null,
        storefrontId: checkout.storefrontId,
        collectionId: checkout.collectionId,
        relicId: checkout.relicId,
        relicEditionId: checkout.relicEditionId,
        status: "paid",
        customerEmail: input.customerEmail || null,
        shippingJson: input.shippingJson || null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      const ledger = ledgerForSale({
        orderId: order.id,
        amountCents: relic.priceCents,
        currency: relic.currency,
        commissionBps: storefront.commissionBps
      });
      checkout.status = "completed";
      checkout.updatedAt = nowIso();
      edition.status = "sold";
      edition.orderId = order.id;
      edition.soldAt = nowIso();
      edition.updatedAt = nowIso();
      relic.reservedCount = Math.max(0, relic.reservedCount - 1);
      relic.soldCount += 1;
      relic.status = relic.soldCount >= relic.totalSupply ? "sold_out" : "live";
      relic.updatedAt = nowIso();
      data.orders.push(order);
      data.ledgerEntries.push(...ledger);
      const bundle = hydrateBundle(data, storefront);
      if (!bundle) throw new Error("Storefront not found.");
      return { order, ledger, bundle };
    });
  }

  const db = sql();
  const result = await db.begin(async (tx) => {
    const [checkout] = await tx`select * from checkout_sessions where stripe_session_id = ${input.stripeSessionId} for update`;
    if (!checkout) throw new Error("Checkout session not found.");
    const existing = await tx`select * from orders where checkout_session_id = ${checkout.id} limit 1`;
    if (checkout.status === "completed" && existing[0]) {
      return { order: row<Order>(toCamel(existing[0])), storefrontId: String(checkout.storefront_id), ledger: [] as LedgerEntry[] };
    }
    const [edition] = await tx`select * from relic_editions where id = ${checkout.relic_edition_id} for update`;
    const [relic] = await tx`select * from relics where id = ${checkout.relic_id} for update`;
    const [storefront] = await tx`select * from storefronts where id = ${checkout.storefront_id}`;
    if (!edition || edition.status !== "reserved") throw new Error("Edition is not reserved.");
    const order: Order = {
      id: newId("ord"),
      checkoutSessionId: String(checkout.id),
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      storefrontId: String(checkout.storefront_id),
      collectionId: String(checkout.collection_id),
      relicId: String(checkout.relic_id),
      relicEditionId: String(checkout.relic_edition_id),
      status: "paid",
      customerEmail: input.customerEmail || null,
      shippingJson: input.shippingJson || null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const ledger = ledgerForSale({
      orderId: order.id,
      amountCents: Number(relic.price_cents),
      currency: String(relic.currency),
      commissionBps: Number(storefront.commission_bps)
    });
    await tx`insert into orders ${tx(toSnake(order))}`;
    for (const entry of ledger) await tx`insert into ledger_entries ${tx(toSnake(entry))}`;
    await tx`update checkout_sessions set status = 'completed', updated_at = now() where id = ${checkout.id}`;
    await tx`
      update relic_editions
      set status = 'sold', order_id = ${order.id}, sold_at = now(), updated_at = now()
      where id = ${checkout.relic_edition_id}
    `;
    await tx`
      update relics
      set reserved_count = greatest(0, reserved_count - 1),
          sold_count = sold_count + 1,
          status = case when sold_count + 1 >= total_supply then 'sold_out' else 'live' end,
          updated_at = now()
      where id = ${checkout.relic_id}
    `;
    return { order, storefrontId: String(checkout.storefront_id), ledger };
  });
  const bundle = await getStorefrontBundleById(result.storefrontId);
  if (!bundle) throw new Error("Storefront not found.");
  return { order: result.order, ledger: result.ledger, bundle };
}

export async function createFulfillmentOrder(input: Omit<FulfillmentOrder, "id" | "createdAt" | "updatedAt">): Promise<FulfillmentOrder> {
  const order: FulfillmentOrder = { id: newId("ful"), createdAt: nowIso(), updatedAt: nowIso(), ...input };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.fulfillmentOrders.push(order);
    });
    return order;
  }
  await sql()`insert into fulfillment_orders ${sql()(toSnake(order))}`;
  return order;
}

export async function updateFulfillmentOrderFromProvider(input: {
  providerOrderId?: string | null;
  providerExternalId?: string | null;
  status?: FulfillmentOrder["status"];
  trackingUrl?: string | null;
  eventJson: Record<string, unknown>;
}): Promise<FulfillmentOrder | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const order = data.fulfillmentOrders.find(
        (entry) =>
          (input.providerOrderId && entry.providerOrderId === input.providerOrderId) ||
          (input.providerExternalId && entry.providerExternalId === input.providerExternalId)
      );
      if (!order) return null;
      order.status = input.status || order.status;
      order.trackingUrl = input.trackingUrl || order.trackingUrl || null;
      order.webhookEventsJson = {
        events: [...(((order.webhookEventsJson as { events?: unknown[] } | null)?.events || []) as unknown[]), input.eventJson]
      };
      order.updatedAt = nowIso();
      return order;
    });
  }
  const [existing] = await sql()`
    select * from fulfillment_orders
    where (${input.providerOrderId || null}::text is not null and provider_order_id = ${input.providerOrderId || null})
       or (${input.providerExternalId || null}::text is not null and provider_external_id = ${input.providerExternalId || null})
    limit 1
  `;
  if (!existing) return null;
  const priorEvents = ((existing.webhook_events_json as { events?: unknown[] } | null)?.events || []) as unknown[];
  const webhookEventsJson = { events: [...priorEvents, input.eventJson] };
  const [updated] = await sql()`
    update fulfillment_orders
    set status = ${input.status || existing.status},
        tracking_url = ${input.trackingUrl || existing.tracking_url || null},
        webhook_events_json = ${JSON.stringify(webhookEventsJson)}::jsonb,
        updated_at = now()
    where id = ${existing.id}
    returning *
  `;
  return updated ? row<FulfillmentOrder>(toCamel(updated)) : null;
}

export async function startDnsClaim(storefrontId: string): Promise<Claim> {
  const bundle = await getStorefrontBundleById(storefrontId);
  if (!bundle) throw new Error("Storefront not found.");
  const token = newId("dns").replace(/^dns_/, "");
  const claim: Claim = {
    id: newId("clm"),
    storefrontId,
    hostname: bundle.brand.hostname,
    txtName: `_droplink.${bundle.brand.hostname}`,
    txtValue: `droplink-verify=${token}`,
    status: "pending",
    verifiedAt: null,
    createdAt: nowIso()
  };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.claims.push(claim);
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      if (storefront) {
        storefront.claimStatus = "pending_dns";
        storefront.updatedAt = nowIso();
      }
    });
    return claim;
  }
  await sql().begin(async (tx) => {
    await tx`insert into claims ${tx(toSnake(claim))}`;
    await tx`update storefronts set claim_status = 'pending_dns', updated_at = now() where id = ${storefrontId}`;
  });
  return claim;
}

export async function getClaim(id: string): Promise<Claim | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.claims.find((entry) => entry.id === id) || null;
  }
  const [claim] = await sql()`select * from claims where id = ${id} limit 1`;
  return claim ? row<Claim>(toCamel(claim)) : null;
}

export async function markClaimVerified(id: string): Promise<void> {
  const claim = await getClaim(id);
  if (!claim) throw new Error("Claim not found.");
  if (!usePostgres()) {
    await mutateStore((data) => {
      const entry = data.claims.find((item) => item.id === id);
      const storefront = data.storefronts.find((item) => item.id === claim.storefrontId);
      if (entry) {
        entry.status = "verified";
        entry.verifiedAt = nowIso();
      }
      if (storefront) {
        storefront.claimStatus = "verified";
        storefront.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`update claims set status = 'verified', verified_at = now() where id = ${id}`;
    await tx`update storefronts set claim_status = 'verified', updated_at = now() where id = ${claim.storefrontId}`;
  });
}

export async function getRelicCheckoutContext(relicId: string) {
  const bundles = await listStorefrontBundles();
  for (const bundle of bundles) {
    const relic = bundle.relics.find((entry) => entry.id === relicId);
    if (relic && bundle.activeCollection) return { bundle, collection: bundle.activeCollection, relic };
  }
  return null;
}

export function tierRelicCount(tier: StorefrontTier, type: "genesis" | "weekly") {
  if (type === "weekly" || tier === "atelier") return 8;
  return 3;
}
