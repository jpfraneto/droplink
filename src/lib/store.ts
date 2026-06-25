import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { sql, usePostgres } from "./db";
import { verifyDroplinkDnsNonce, verifyDroplinkPayoutDns } from "./dnsClaim";
import { dropConfig, x402Readiness, tempoReadiness } from "./env";
import { calculateWaterfall } from "./economics";
import { newId } from "./hashes";
import { priceBookProfitBlockers, priceBookRelicPriceCents } from "./pricing";
import type {
  AdminReview,
  Asset,
  Brand,
  BrandSnapshot,
  BrandStudy,
  CheckoutSession,
  Claim,
  Collection,
  Drop,
  DropSourceSignal,
  FulfillmentOrder,
  GenerationJob,
  GenerationStep,
  LedgerEntry,
  LedgerAccrual,
  Mockup,
  OgImage,
  Order,
  Relic,
  RelicEdition,
  RelicPlan,
  StoreData,
  Storefront,
  StorefrontBundle,
  SystemEvent
} from "./types";

function dataFile() {
  return process.env.DROPLINK_DATA_FILE || path.join(process.cwd(), "data", "store.json");
}

export const emptyStore: StoreData = {
  drops: [],
  dropSourceSignals: [],
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
  ledgerAccruals: [],
  fulfillmentOrders: [],
  stripeAccounts: [],
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
    drops: input.drops || [],
    dropSourceSignals: input.dropSourceSignals || [],
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
    ledgerAccruals: input.ledgerAccruals || [],
    fulfillmentOrders: input.fulfillmentOrders || [],
    stripeAccounts: input.stripeAccounts || [],
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
  const drop = data.drops.find((entry) => entry.storefrontId === storefront.id) || null;
  const sourceSignals = drop ? data.dropSourceSignals.filter((entry) => entry.dropId === drop.id) : [];
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
  const orders = drop ? data.orders.filter((entry) => entry.dropId === drop.id) : [];
  const ledgerAccruals = drop ? data.ledgerAccruals.filter((entry) => entry.dropId === drop.id) : [];
  return {
    drop,
    sourceSignals,
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
    orders,
    ledgerAccruals,
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

export async function getDropByCanonicalHash(domainHash: string): Promise<Drop | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.drops.find((entry) => entry.rootDomainHash === domainHash || entry.domainHash === domainHash) || null;
  }
  const [drop] = await sql()`select * from drops where root_domain_hash = ${domainHash} or domain_hash = ${domainHash} limit 1`;
  return drop ? row<Drop>(toCamel(drop)) : null;
}

export async function recordDropSourceSignal(input: Omit<DropSourceSignal, "id" | "submittedAt"> & { id?: string; submittedAt?: string }): Promise<DropSourceSignal> {
  const signal: DropSourceSignal = {
    id: input.id || newId("sig"),
    submittedAt: input.submittedAt || nowIso(),
    ...input
  };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.dropSourceSignals.push(signal);
    });
    return signal;
  }
  await sql()`insert into drop_source_signals ${sql()(toSnake(signal))}`;
  return signal;
}

export async function getDropBundleByDropId(dropId: string): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    const data = await readStore();
    const drop = data.drops.find((entry) => entry.id === dropId);
    const storefront = drop ? data.storefronts.find((entry) => entry.id === drop.storefrontId) : null;
    return storefront ? hydrateBundle(data, storefront) : null;
  }
  const [drop] = await sql()`select storefront_id from drops where id = ${dropId} limit 1`;
  return drop ? getStorefrontBundleById(String(drop.storefront_id)) : null;
}

export async function getDropBundleByCanonicalHash(domainHash: string): Promise<StorefrontBundle | null> {
  const drop = await getDropByCanonicalHash(domainHash);
  return drop ? getDropBundleByDropId(drop.id) : null;
}

export async function getGenerationJob(id: string): Promise<GenerationJob | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.generationJobs.find((entry) => entry.id === id) || null;
  }
  const [job] = await sql()`select * from generation_jobs where id = ${id} limit 1`;
  return job ? row<GenerationJob>(toCamel(job)) : null;
}

export async function getGenerationJobByTraceId(traceId: string): Promise<GenerationJob | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.generationJobs.find((entry) => entry.traceId === traceId) || null;
  }
  const [job] = await sql()`select * from generation_jobs where trace_id = ${traceId} order by created_at desc limit 1`;
  return job ? row<GenerationJob>(toCamel(job)) : null;
}

export async function listGenerationJobs(limit = 20): Promise<GenerationJob[]> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.generationJobs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const rows = await sql()`select * from generation_jobs order by created_at desc limit ${limit}`;
  return rows.map((entry) => row<GenerationJob>(toCamel(entry)));
}

export async function listSystemEventsByTraceId(traceId: string, limit = 300): Promise<SystemEvent[]> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.systemEvents
      .filter((entry) => entry.traceId === traceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const rows = await sql()`
    select * from system_events
    where trace_id = ${traceId}
    order by created_at desc
    limit ${limit}
  `;
  return rows.map((entry) => row<SystemEvent>(toCamel(entry)));
}

export async function createGenerationJob(input: {
  id?: string;
  traceId: string;
  type: "drop";
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
  const [dropRow] = await db`select * from drops where storefront_id = ${id} limit 1`;
  const sourceSignalRows = dropRow ? await db`select * from drop_source_signals where drop_id = ${dropRow.id} order by submitted_at asc` : [];
  const orderRows = dropRow ? await db`select * from orders where drop_id = ${dropRow.id} order by created_at desc` : [];
  const accrualRows = dropRow ? await db`select * from ledger_accruals where drop_id = ${dropRow.id} order by created_at desc` : [];
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
    drop: dropRow ? row<Drop>(toCamel(dropRow)) : null,
    sourceSignals: sourceSignalRows.map((entry) => row<DropSourceSignal>(toCamel(entry))),
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
    orders: orderRows.map((entry) => row<Order>(toCamel(entry))),
    ledgerAccruals: accrualRows.map((entry) => row<LedgerAccrual>(toCamel(entry))),
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
  drop?: Drop | null;
  brand: Brand;
  storefront: Storefront;
  snapshot: BrandSnapshot;
  study: BrandStudy;
  collection: Collection;
  relicPlan: RelicPlan;
  relics: Relic[];
  editions: RelicEdition[];
  sourceSignals?: DropSourceSignal[];
  assets: Asset[];
  mockups: Mockup[];
  ogImage: OgImage;
  adminReview: AdminReview;
  job: GenerationJob;
}): Promise<StorefrontBundle> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      if (bundle.drop) data.drops.push(bundle.drop);
      if (bundle.sourceSignals) data.dropSourceSignals.push(...bundle.sourceSignals);
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
    if (bundle.drop) await tx`insert into drops ${tx(toSnake(bundle.drop))}`;
    for (const signal of bundle.sourceSignals || []) await tx`insert into drop_source_signals ${tx(toSnake(signal))}`;
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
  if (!bundle.drop) throw new Error("Drop metadata is missing.");
  if (bundle.drop.status !== "claimed") throw new Error("Drop must be DNS claimed before publishing.");
  if (bundle.drop.domainClaimStatus !== "verified") throw new Error("Drop must be DNS verified before publishing.");
  const activeCollection = bundle.activeCollection;
  const readiness = reviewReadiness(bundle);
  if (!readiness.ready) throw new Error(`Storefront is not ready to publish: ${readiness.blockers.join(", ")}`);
  const lockedAt = nowIso();
  const lockedPriceBook = bundle.drop.priceBookJson ? { ...bundle.drop.priceBookJson, status: "locked" as const, lockedAt } : null;

  if (!usePostgres()) {
    return mutateStore((data) => {
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      const collection = data.collections.find((entry) => entry.id === bundle.activeCollection?.id);
      if (!storefront || !collection) throw new Error("Storefront not found.");
      const drop = data.drops.find((entry) => entry.storefrontId === storefrontId);
      if (!drop) throw new Error("Drop metadata is missing.");
      drop.status = "published";
      drop.publishStatus = "published";
      drop.publishedAt = nowIso();
      drop.readinessJson = readiness;
      drop.priceBookJson = lockedPriceBook;
      drop.projectedEconomicsJson = lockedPriceBook?.totals || drop.projectedEconomicsJson || null;
      drop.priceBookLockedAt = lockedAt;
      drop.updatedAt = nowIso();
      storefront.status = "published";
      storefront.commerceMode = "platform_checkout";
      storefront.generationStatus = "PUBLISHED";
      storefront.publishedAt = nowIso();
      storefront.updatedAt = nowIso();
      collection.status = "published";
      collection.publishedAt = nowIso();
      data.relics
        .filter((entry) => entry.collectionId === collection.id)
        .forEach((relic) => {
          relic.status = relic.soldCount >= relic.totalSupply ? "sold_out" : "live";
          relic.priceLockedAt = lockedAt;
          relic.updatedAt = nowIso();
        });
      const hydrated = hydrateBundle(data, storefront);
      if (!hydrated) throw new Error("Could not hydrate published storefront.");
      return hydrated;
    });
  }

  await sql().begin(async (tx) => {
    await tx`
      update drops
      set status = 'published',
          publish_status = 'published',
          published_at = now(),
          readiness_json = ${JSON.stringify(readiness)}::jsonb,
          price_book_json = ${JSON.stringify(lockedPriceBook)}::jsonb,
          projected_economics_json = ${JSON.stringify(lockedPriceBook?.totals || null)}::jsonb,
          price_book_locked_at = ${lockedAt},
          updated_at = now()
      where storefront_id = ${storefrontId}
    `;
    await tx`
      update storefronts
      set status = 'published',
          commerce_mode = 'platform_checkout',
          generation_status = 'PUBLISHED',
          published_at = now(),
          updated_at = now()
      where id = ${storefrontId}
    `;
    await tx`update collections set status = 'published', published_at = now() where id = ${activeCollection.id}`;
    await tx`update relics set status = case when sold_count >= total_supply then 'sold_out' else 'live' end, price_locked_at = ${lockedAt}, updated_at = now() where collection_id = ${activeCollection.id}`;
  });
  const published = await getStorefrontBundleById(storefrontId);
  if (!published) throw new Error("Published storefront could not be loaded.");
  return published;
}

export async function archiveStorefront(storefrontId: string): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      if (storefront) {
        storefront.status = "archived";
        storefront.updatedAt = nowIso();
      }
      const drop = data.drops.find((entry) => entry.storefrontId === storefrontId);
      if (drop) {
        drop.status = "archived";
        drop.archivedAt = nowIso();
        drop.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`update storefronts set status = 'archived', updated_at = now() where id = ${storefrontId}`;
    await tx`update drops set status = 'archived', archived_at = now(), updated_at = now() where storefront_id = ${storefrontId}`;
  });
}

export function reviewReadiness(bundle: StorefrontBundle): { ready: boolean; blockers: string[]; checklist: Record<string, boolean> } {
  const collection = bundle.activeCollection;
  const relics = bundle.relics;
  const editionsByRelic = new Map<string, number>();
  for (const edition of bundle.editions) editionsByRelic.set(edition.relicId, (editionsByRelic.get(edition.relicId) || 0) + 1);
  const x402 = x402Readiness();
  const tempo = tempoReadiness();
  const priceBook = bundle.drop?.priceBookJson || null;
  const priceBlockers = priceBookProfitBlockers(priceBook);
  const checklist = {
    canonicalRootDomainExists: Boolean(bundle.drop?.canonicalRootDomain || bundle.drop?.registrableDomain || bundle.drop?.canonicalDomain),
    noDuplicateSubdomainSupply: Boolean(bundle.drop?.rootDomainHash || bundle.drop?.domainHash),
    allowMocksFalse: process.env.ALLOW_MOCKS === "false",
    domainClaimVerified: Boolean(bundle.drop?.domainClaimStatus === "verified" && ["claimed", "published", "sold_out"].includes(bundle.drop.status)),
    payoutStatusVisible: Boolean(bundle.drop?.payoutStatus),
    payoutReadyIfRequired: dropConfig.requirePayoutBeforePublish ? bundle.drop?.payoutStatus === "tempo_wallet_ready" || bundle.drop?.payoutStatus === "stripe_connect_ready" : true,
    finiteRelicCount: relics.length === dropConfig.relicsPerDrop,
    finiteEditionCount: bundle.editions.length === dropConfig.totalSupply,
    finiteEditionsPerRelic: relics.every((relic) => editionsByRelic.get(relic.id) === dropConfig.editionsPerRelic),
    x402SummonConfigured: x402.ready,
    tempoSettlementStatusVisible: Boolean(tempo.ready || tempo.missing.length),
    urlCrawled: Boolean(bundle.brandStudy),
    brandStudyGenerated: Boolean(bundle.brandStudy),
    relicPlanValid: Boolean(bundle.relicPlan && collection && bundle.relicPlan.planJson.relics.length === dropConfig.relicsPerDrop),
    printfulVariantSelected: relics.every((relic) => Boolean(relic.printfulProductId && relic.printfulVariantId)),
    printFilesGenerated: relics.every((relic) => bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file")),
    printFilesValid: relics.every((relic) =>
      bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.validationStatus === "valid")
    ),
    mockupsGenerated: relics.every((relic) =>
      bundle.mockups.some((mockup) => mockup.relicId === relic.id && mockup.status === "ready" && /^https:\/\//i.test(mockup.imageUrl) && !mockup.imageUrl.includes("/api/mockups/"))
    ),
    ogGenerated: Boolean(
      bundle.ogImage?.status === "ready" &&
        (bundle.ogImage.assetId
          ? bundle.assets.some((asset) => asset.id === bundle.ogImage?.assetId && asset.type === "og" && asset.validationStatus === "valid")
          : /^https:\/\//i.test(bundle.ogImage.imageUrl) && !bundle.ogImage.imageUrl.includes("/api/mockups/"))
    ),
    editionsCreated: relics.every((relic) => editionsByRelic.get(relic.id) === dropConfig.editionsPerRelic),
    unitPricesPresent: relics.every((relic) => Boolean(relic.unitPriceUsd && Number(relic.unitPriceUsd) > 0 && relic.priceCents > 0)),
    priceBookExists: Boolean(priceBook),
    projectedEconomicsExists: Boolean(bundle.drop?.projectedEconomicsJson || priceBook?.totals),
    priceBookTotalsValid: Boolean(priceBook?.totals.maxSupply === 24 && priceBook.relics.length === 3),
    pricesMarginsValid: priceBlockers.length === 0,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    printfulReady: Boolean(process.env.PRINTFUL_API_KEY && process.env.PRINTFUL_API_BASE && process.env.PRINTFUL_STORE_ID),
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
    noMockAssets: !bundle.assets.some((asset) => asset.validationStatus === "mock" || asset.validationStatus === "pending" || asset.url.includes("/api/mockups/")),
    noMockCopy: process.env.AI_PROVIDER === "openai" && ["openai", "manual", "chatgpt", "chatgpt_manual"].includes(process.env.IMAGE_PROVIDER || "openai"),
    printfulManualModeVisible: process.env.PRINTFUL_CONFIRM_ORDERS !== "true"
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
  editionId?: string | null;
  editionNumber?: number | null;
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
      const drop = storefront ? data.drops.find((entry) => entry.storefrontId === storefront.id) : null;
      if (!collection || !storefront || !drop || drop.status !== "published" || storefront.status !== "published" || collection.status !== "published" || relic.status !== "live") {
        throw new Error("Relic is not available for checkout.");
      }
      if (!drop.priceBookJson || drop.priceBookJson.status !== "locked" || !drop.priceBookLockedAt) throw new Error("Drop price book is not locked.");
      const lockedPrice = priceBookRelicPriceCents(drop.priceBookJson, relic.id);
      if (!lockedPrice) throw new Error("Locked price is missing for this relic.");
      if (!reviewReadiness(hydrateBundle(data, storefront) as StorefrontBundle).ready) throw new Error("Drop readiness is blocked.");
      const edition = data.relicEditions
        .filter(
          (entry) =>
            entry.relicId === relic.id &&
            entry.status === "available" &&
            (!input.editionId || entry.id === input.editionId) &&
            (!input.editionNumber || entry.editionNumber === input.editionNumber)
        )
        .sort((a, b) => a.editionNumber - b.editionNumber)[0];
      if (!edition) throw new Error("SOLD_OUT");
      edition.status = "reserved";
      edition.checkoutSessionId = checkoutId;
      edition.reservedAt = nowIso();
      edition.reservedUntil = expiresAt;
      edition.updatedAt = nowIso();
      relic.reservedCount += 1;
      relic.updatedAt = nowIso();
      const checkout: CheckoutSession = {
        id: checkoutId,
        stripeSessionId: `pending_${checkoutId}`,
        dropId: drop.id,
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
      set status = 'available', checkout_session_id = null, reserved_at = null, reserved_until = null, updated_at = now()
      where status = 'reserved' and reserved_until < now()
    `;
    const [relic] = await tx`select * from relics where id = ${input.relicId} for update`;
    if (!relic) throw new Error("Relic not found.");
    const [collection] = await tx`select * from collections where id = ${relic.collection_id}`;
    const [storefront] = await tx`select * from storefronts where id = ${collection.storefront_id}`;
    const [drop] = await tx`select * from drops where storefront_id = ${storefront.id}`;
    if (!drop || drop.status !== "published" || storefront.status !== "published" || collection.status !== "published" || relic.status !== "live") {
      throw new Error("Relic is not available for checkout.");
    }
    const priceBook = drop.price_book_json as unknown as Drop["priceBookJson"];
    if (!priceBook || priceBook.status !== "locked" || !drop.price_book_locked_at) throw new Error("Drop price book is not locked.");
    if (!priceBookRelicPriceCents(priceBook, String(relic.id))) throw new Error("Locked price is missing for this relic.");
    const [edition] = await tx`
      select * from relic_editions
      where relic_id = ${input.relicId}
        and status = 'available'
        ${input.editionId ? tx`and id = ${input.editionId}` : tx``}
        ${input.editionNumber ? tx`and edition_number = ${input.editionNumber}` : tx``}
      order by edition_number asc
      limit 1
      for update skip locked
    `;
    if (!edition) throw new Error("SOLD_OUT");
    await tx`
      update relic_editions
      set status = 'reserved', checkout_session_id = ${checkoutId}, reserved_at = now(), reserved_until = ${expiresAt}, updated_at = now()
      where id = ${edition.id}
    `;
    await tx`update relics set reserved_count = reserved_count + 1, updated_at = now() where id = ${input.relicId}`;
    const checkout: CheckoutSession = {
      id: checkoutId,
      stripeSessionId: `pending_${checkoutId}`,
      dropId: String(drop.id),
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
        edition.reservedAt = null;
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
        edition.reservedAt = null;
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
      set status = 'available', checkout_session_id = null, reserved_at = null, reserved_until = null, updated_at = now()
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
  creatorBountyCents: number;
  domainOwnerCents: number;
  protocolFeeCents: number;
  printfulCostCents?: number;
  printfulShippingCents?: number;
}): LedgerEntry[] {
  const printfulCost = input.printfulCostCents || 0;
  const printfulShipping = input.printfulShippingCents || 0;
  const createdAt = nowIso();
  return [
    { id: newId("led"), orderId: input.orderId, type: "customer_payment", amountCents: input.amountCents, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "creator_bounty", amountCents: input.creatorBountyCents, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "domain_owner_proceeds", amountCents: input.domainOwnerCents, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "protocol_fee", amountCents: input.protocolFeeCents, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "printful_cost", amountCents: -printfulCost, currency: input.currency, createdAt },
    { id: newId("led"), orderId: input.orderId, type: "printful_shipping", amountCents: -printfulShipping, currency: input.currency, createdAt }
  ];
}

function centsFromUsd(input: string | number | null | undefined): number {
  const value = Number(input || 0);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function lockedPriceEconomics(drop: Drop, relic: Relic) {
  if (!drop.priceBookJson || drop.priceBookJson.status !== "locked") throw new Error("Locked price book is required for sale economics.");
  const entry = drop.priceBookJson.relics.find((item) => item.relicId === relic.id);
  if (!entry) throw new Error("Locked price book is missing this relic.");
  return {
    priceBookId: drop.id,
    grossAmount: centsFromUsd(entry.unitPriceUsd),
    printfulCostAmount: centsFromUsd(entry.estimatedUnitPrintfulCostUsd),
    stripeFeeAmount: centsFromUsd(entry.estimatedUnitPaymentFeeUsd),
    refundReserveAmount: centsFromUsd(entry.estimatedUnitRefundReserveUsd)
  };
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
      const drop = storefront ? data.drops.find((entry) => entry.storefrontId === storefront.id) : null;
      if (!edition || !relic || !storefront || !drop || edition.status !== "reserved") throw new Error("Edition is not reserved.");
      const locked = lockedPriceEconomics(drop, relic);
      const waterfall = calculateWaterfall({
        grossAmount: locked.grossAmount,
        currency: relic.currency,
        stripeFeeAmount: locked.stripeFeeAmount,
        printfulCostAmount: locked.printfulCostAmount,
        refundReserveAmount: locked.refundReserveAmount,
        creatorBountyBps: drop.creatorBountyBps,
        protocolFeeBps: drop.protocolFeeBps
      });
      const order: Order = {
        id: newId("ord"),
        checkoutSessionId: checkout.id,
        dropId: drop.id,
        stripePaymentIntentId: input.stripePaymentIntentId || null,
        storefrontId: checkout.storefrontId,
        collectionId: checkout.collectionId,
        relicId: checkout.relicId,
        relicEditionId: checkout.relicEditionId,
        status: "paid",
        customerEmail: input.customerEmail || null,
        shippingJson: input.shippingJson || null,
        grossAmount: waterfall.grossAmount,
        currency: waterfall.currency,
        taxAmount: waterfall.taxAmount,
        shippingAmount: waterfall.shippingAmount,
        stripeFeeAmount: waterfall.stripeFeeAmount,
        printfulCostAmount: waterfall.printfulCostAmount,
        refundReserveAmount: waterfall.refundReserveAmount,
        netMarginAmount: waterfall.netMarginAmount,
        creatorBountyAmount: waterfall.creatorBountyAmount,
        domainOwnerAmount: waterfall.domainOwnerAmount,
        protocolFeeAmount: waterfall.protocolFeeAmount,
        settlementStatus: "internal_pending",
        economicsStatus: "estimated",
        priceBookId: locked.priceBookId,
        adminReviewRequired: waterfall.adminReviewRequired,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      const ledger = ledgerForSale({
        orderId: order.id,
        amountCents: locked.grossAmount,
        currency: relic.currency,
        creatorBountyCents: waterfall.creatorBountyAmount,
        domainOwnerCents: waterfall.domainOwnerAmount,
        protocolFeeCents: waterfall.protocolFeeAmount,
        printfulCostCents: locked.printfulCostAmount
      });
      const accruals: LedgerAccrual[] =
        waterfall.netMarginAmount <= 0
          ? []
          : [
              {
                id: newId("acc"),
                dropId: drop.id,
                orderId: order.id,
                beneficiaryType: "creator" as const,
                beneficiaryWallet: drop.summonerWallet || null,
                amount: waterfall.creatorBountyAmount,
                currency: relic.currency,
                status: "pending" as const,
                reason: "creator bounty from net drop margin",
                txHash: null,
                createdAt: nowIso(),
                updatedAt: nowIso()
              },
              {
                id: newId("acc"),
                dropId: drop.id,
                orderId: order.id,
                beneficiaryType: "domain_owner" as const,
                beneficiaryWallet: drop.tempoWalletAddress || null,
                amount: waterfall.domainOwnerAmount,
                currency: relic.currency,
                status: "pending" as const,
                reason: "domain owner proceeds from net drop margin",
                txHash: null,
                createdAt: nowIso(),
                updatedAt: nowIso()
              },
              {
                id: newId("acc"),
                dropId: drop.id,
                orderId: order.id,
                beneficiaryType: "protocol" as const,
                beneficiaryWallet: process.env.DROPLINK_TREASURY_ADDRESS || null,
                amount: waterfall.protocolFeeAmount,
                currency: relic.currency,
                status: "pending" as const,
                reason: "configured protocol fee from net drop margin",
                txHash: null,
                createdAt: nowIso(),
                updatedAt: nowIso()
              }
            ].filter((entry) => entry.amount > 0);
      checkout.status = "completed";
      checkout.updatedAt = nowIso();
      edition.status = "sold";
      edition.orderId = order.id;
      edition.stripePaymentIntentId = input.stripePaymentIntentId || null;
      edition.soldAt = nowIso();
      edition.updatedAt = nowIso();
      relic.reservedCount = Math.max(0, relic.reservedCount - 1);
      relic.soldCount += 1;
      relic.status = relic.soldCount >= relic.totalSupply ? "sold_out" : "live";
      relic.updatedAt = nowIso();
      data.orders.push(order);
      data.ledgerEntries.push(...ledger);
      data.ledgerAccruals.push(...accruals);
      if (data.relicEditions.filter((entry) => entry.dropId === drop.id && entry.status === "sold").length >= drop.totalSupply) {
        drop.status = "sold_out";
        drop.soldOutAt = nowIso();
        drop.updatedAt = nowIso();
        storefront.status = "sold_out";
        storefront.updatedAt = nowIso();
      }
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
    const [drop] = await tx`select * from drops where storefront_id = ${checkout.storefront_id} for update`;
    if (!edition || edition.status !== "reserved") throw new Error("Edition is not reserved.");
    if (!drop) throw new Error("Drop metadata is missing.");
    const typedDrop = row<Drop>(toCamel(drop));
    const typedRelic = row<Relic>(toCamel(relic));
    const locked = lockedPriceEconomics(typedDrop, typedRelic);
    const waterfall = calculateWaterfall({
      grossAmount: locked.grossAmount,
      currency: String(relic.currency),
      stripeFeeAmount: locked.stripeFeeAmount,
      printfulCostAmount: locked.printfulCostAmount,
      refundReserveAmount: locked.refundReserveAmount,
      creatorBountyBps: Number(drop.creator_bounty_bps),
      protocolFeeBps: Number(drop.protocol_fee_bps)
    });
    const order: Order = {
      id: newId("ord"),
      checkoutSessionId: String(checkout.id),
      dropId: String(drop.id),
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      storefrontId: String(checkout.storefront_id),
      collectionId: String(checkout.collection_id),
      relicId: String(checkout.relic_id),
      relicEditionId: String(checkout.relic_edition_id),
      status: "paid",
      customerEmail: input.customerEmail || null,
      shippingJson: input.shippingJson || null,
      grossAmount: waterfall.grossAmount,
      currency: waterfall.currency,
      taxAmount: waterfall.taxAmount,
      shippingAmount: waterfall.shippingAmount,
      stripeFeeAmount: waterfall.stripeFeeAmount,
      printfulCostAmount: waterfall.printfulCostAmount,
      refundReserveAmount: waterfall.refundReserveAmount,
      netMarginAmount: waterfall.netMarginAmount,
      creatorBountyAmount: waterfall.creatorBountyAmount,
      domainOwnerAmount: waterfall.domainOwnerAmount,
      protocolFeeAmount: waterfall.protocolFeeAmount,
      settlementStatus: "internal_pending",
      economicsStatus: "estimated",
      priceBookId: locked.priceBookId,
      adminReviewRequired: waterfall.adminReviewRequired,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const ledger = ledgerForSale({
      orderId: order.id,
      amountCents: locked.grossAmount,
      currency: String(relic.currency),
      creatorBountyCents: waterfall.creatorBountyAmount,
      domainOwnerCents: waterfall.domainOwnerAmount,
      protocolFeeCents: waterfall.protocolFeeAmount,
      printfulCostCents: locked.printfulCostAmount
    });
    await tx`insert into orders ${tx(toSnake(order))}`;
    for (const entry of ledger) await tx`insert into ledger_entries ${tx(toSnake(entry))}`;
    if (waterfall.netMarginAmount > 0) {
      const accruals: LedgerAccrual[] = [
        {
          id: newId("acc"),
          dropId: String(drop.id),
          orderId: order.id,
          beneficiaryType: "creator" as const,
          beneficiaryWallet: String(drop.summoner_wallet || "") || null,
          amount: waterfall.creatorBountyAmount,
          currency: String(relic.currency),
          status: "pending" as const,
          reason: "creator bounty from net drop margin",
          txHash: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        {
          id: newId("acc"),
          dropId: String(drop.id),
          orderId: order.id,
          beneficiaryType: "domain_owner" as const,
          beneficiaryWallet: String(drop.tempo_wallet_address || "") || null,
          amount: waterfall.domainOwnerAmount,
          currency: String(relic.currency),
          status: "pending" as const,
          reason: "domain owner proceeds from net drop margin",
          txHash: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        {
          id: newId("acc"),
          dropId: String(drop.id),
          orderId: order.id,
          beneficiaryType: "protocol" as const,
          beneficiaryWallet: process.env.DROPLINK_TREASURY_ADDRESS || null,
          amount: waterfall.protocolFeeAmount,
          currency: String(relic.currency),
          status: "pending" as const,
          reason: "configured protocol fee from net drop margin",
          txHash: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        }
      ].filter((entry) => entry.amount > 0);
      for (const accrual of accruals) await tx`insert into ledger_accruals ${tx(toSnake(accrual))} on conflict do nothing`;
    }
    await tx`update checkout_sessions set status = 'completed', updated_at = now() where id = ${checkout.id}`;
    await tx`
      update relic_editions
      set status = 'sold', order_id = ${order.id}, stripe_payment_intent_id = ${input.stripePaymentIntentId || null}, sold_at = now(), updated_at = now()
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
    await tx`
      update drops
      set status = 'sold_out', sold_out_at = now(), updated_at = now()
      where id = ${drop.id}
        and (select count(*) from relic_editions where drop_id = ${drop.id} and status = 'sold') >= total_supply
    `;
    await tx`
      update storefronts
      set status = 'sold_out', updated_at = now()
      where id = ${checkout.storefront_id}
        and exists (select 1 from drops where storefront_id = ${checkout.storefront_id} and status = 'sold_out')
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
    return mutateStore((data) => {
      const existing = data.fulfillmentOrders.find((entry) => entry.orderId === input.orderId && entry.provider === input.provider);
      if (existing) return existing;
      data.fulfillmentOrders.push(order);
      return order;
    });
  }
  const [existing] = await sql()`select * from fulfillment_orders where order_id = ${input.orderId} and provider = ${input.provider} limit 1`;
  if (existing) return row<FulfillmentOrder>(toCamel(existing));
  await sql()`insert into fulfillment_orders ${sql()(toSnake(order))}`;
  return order;
}

export async function getFulfillmentOrderByOrderId(orderId: string): Promise<FulfillmentOrder | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.fulfillmentOrders.find((entry) => entry.orderId === orderId && entry.provider === "printful") || null;
  }
  const [existing] = await sql()`select * from fulfillment_orders where order_id = ${orderId} and provider = 'printful' limit 1`;
  return existing ? row<FulfillmentOrder>(toCamel(existing)) : null;
}

export async function updateOrderFulfillmentFields(input: {
  orderId: string;
  printfulOrderId?: string | null;
  printfulStatus?: string | null;
  printfulDashboardUrl?: string | null;
  printfulTrackingUrl?: string | null;
  printfulCostsJson?: Record<string, unknown> | null;
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const order = data.orders.find((entry) => entry.id === input.orderId);
      if (!order) return;
      order.printfulOrderId = input.printfulOrderId || order.printfulOrderId || null;
      order.printfulStatus = input.printfulStatus || order.printfulStatus || null;
      order.printfulDashboardUrl = input.printfulDashboardUrl || order.printfulDashboardUrl || null;
      order.printfulTrackingUrl = input.printfulTrackingUrl || order.printfulTrackingUrl || null;
      order.printfulCostsJson = input.printfulCostsJson || order.printfulCostsJson || null;
      order.updatedAt = nowIso();
    });
    return;
  }
  await sql()`
    update orders
    set printful_order_id = ${input.printfulOrderId || null},
        printful_status = ${input.printfulStatus || null},
        printful_dashboard_url = ${input.printfulDashboardUrl || null},
        printful_tracking_url = ${input.printfulTrackingUrl || null},
        printful_costs_json = ${input.printfulCostsJson ? JSON.stringify(input.printfulCostsJson) : null}::jsonb,
        updated_at = now()
    where id = ${input.orderId}
  `;
}

export async function updateRelicMockupResult(input: {
  relicId: string;
  mockupId: string;
  status: string;
  imageUrl?: string | null;
  mockupUrls?: string[];
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const mockup = data.mockups.find((entry) => entry.id === input.mockupId);
      if (mockup) {
        mockup.status = input.status;
        if (input.imageUrl) mockup.imageUrl = input.imageUrl;
      }
      const relic = data.relics.find((entry) => entry.id === input.relicId);
      if (relic?.fulfillmentSpecJson && input.mockupUrls) {
        relic.fulfillmentSpecJson = { ...relic.fulfillmentSpecJson, mockupUrls: input.mockupUrls };
        relic.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`
      update mockups
      set status = ${input.status},
          image_url = coalesce(${input.imageUrl || null}, image_url)
      where id = ${input.mockupId}
    `;
    if (input.mockupUrls) {
      const [relic] = await tx`select fulfillment_spec_json from relics where id = ${input.relicId} for update`;
      const spec = ((relic?.fulfillment_spec_json || {}) as Record<string, unknown>) || {};
      await tx`
        update relics
        set fulfillment_spec_json = ${JSON.stringify({ ...spec, mockupUrls: input.mockupUrls })}::jsonb,
            updated_at = now()
        where id = ${input.relicId}
      `;
    }
  });
}

export async function updateManualRelicArtwork(input: {
  dropId: string;
  relicId: string;
  printAsset: Asset;
  previewAsset: Asset;
  mockupId: string;
  mockupImageUrl: string;
  printFileUrl: string;
  printFileSha256: string;
}): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const upsertAsset = (asset: Asset) => {
        const existing = data.assets.find((entry) => entry.id === asset.id) || data.assets.find((entry) => entry.relicId === asset.relicId && entry.type === asset.type);
        if (existing) Object.assign(existing, asset);
        else data.assets.push(asset);
      };
      upsertAsset(input.printAsset);
      upsertAsset(input.previewAsset);
      const relic = data.relics.find((entry) => entry.id === input.relicId);
      if (relic?.fulfillmentSpecJson) {
        relic.fulfillmentSpecJson = {
          ...relic.fulfillmentSpecJson,
          printFileUrl: input.printFileUrl,
          printFileSha256: input.printFileSha256
        };
        relic.updatedAt = nowIso();
      }
      const mockup = data.mockups.find((entry) => entry.id === input.mockupId) || data.mockups.find((entry) => entry.relicId === input.relicId);
      if (mockup) {
        mockup.assetId = input.previewAsset.id;
        mockup.imageUrl = input.mockupImageUrl;
        mockup.status = "ready";
      } else {
        data.mockups.push({
          id: input.mockupId,
          relicId: input.relicId,
          assetId: input.previewAsset.id,
          imageUrl: input.mockupImageUrl,
          printfulTaskId: null,
          viewName: "front",
          status: "ready",
          createdAt: nowIso()
        });
      }
      const drop = data.drops.find((entry) => entry.id === input.dropId);
      const storefront = drop ? data.storefronts.find((entry) => entry.id === drop.storefrontId) : null;
      return storefront ? hydrateBundle(data, storefront) : null;
    });
  }

  await sql().begin(async (tx) => {
    await tx`
      insert into assets ${tx(toSnake(input.printAsset))}
      on conflict (id) do update
      set url = excluded.url,
          storage_provider = excluded.storage_provider,
          width = excluded.width,
          height = excluded.height,
          checksum = excluded.checksum,
          prompt = excluded.prompt,
          validation_status = excluded.validation_status,
          metadata_json = excluded.metadata_json
    `;
    await tx`
      insert into assets ${tx(toSnake(input.previewAsset))}
      on conflict (id) do update
      set url = excluded.url,
          storage_provider = excluded.storage_provider,
          width = excluded.width,
          height = excluded.height,
          checksum = excluded.checksum,
          prompt = excluded.prompt,
          validation_status = excluded.validation_status,
          metadata_json = excluded.metadata_json
    `;
    const [relic] = await tx`select fulfillment_spec_json from relics where id = ${input.relicId} for update`;
    const spec = ((relic?.fulfillment_spec_json || {}) as Record<string, unknown>) || {};
    await tx`
      update relics
      set fulfillment_spec_json = ${JSON.stringify({ ...spec, printFileUrl: input.printFileUrl, printFileSha256: input.printFileSha256 })}::jsonb,
          updated_at = now()
      where id = ${input.relicId}
    `;
    await tx`
      insert into mockups (id, relic_id, asset_id, image_url, printful_task_id, view_name, status, created_at)
      values (${input.mockupId}, ${input.relicId}, ${input.previewAsset.id}, ${input.mockupImageUrl}, null, 'front', 'ready', now())
      on conflict (id) do update
      set asset_id = excluded.asset_id,
          image_url = excluded.image_url,
          status = excluded.status
    `;
  });
  return getDropBundleByDropId(input.dropId);
}

export async function updateManualOgImage(input: {
  dropId: string;
  collectionId: string;
  asset: Asset;
  ogImage: OgImage;
}): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existingAsset = data.assets.find((entry) => entry.id === input.asset.id) || data.assets.find((entry) => entry.collectionId === input.collectionId && entry.type === "og");
      if (existingAsset) Object.assign(existingAsset, input.asset);
      else data.assets.push(input.asset);
      const existingOg = data.ogImages.find((entry) => entry.id === input.ogImage.id) || data.ogImages.find((entry) => entry.collectionId === input.collectionId);
      if (existingOg) Object.assign(existingOg, input.ogImage);
      else data.ogImages.push(input.ogImage);
      const collection = data.collections.find((entry) => entry.id === input.collectionId);
      if (collection) collection.ogImageId = input.ogImage.id;
      const drop = data.drops.find((entry) => entry.id === input.dropId);
      const storefront = drop ? data.storefronts.find((entry) => entry.id === drop.storefrontId) : null;
      return storefront ? hydrateBundle(data, storefront) : null;
    });
  }

  await sql().begin(async (tx) => {
    await tx`
      insert into assets ${tx(toSnake(input.asset))}
      on conflict (id) do update
      set url = excluded.url,
          storage_provider = excluded.storage_provider,
          width = excluded.width,
          height = excluded.height,
          checksum = excluded.checksum,
          prompt = excluded.prompt,
          validation_status = excluded.validation_status,
          metadata_json = excluded.metadata_json
    `;
    await tx`
      insert into og_images ${tx(toSnake(input.ogImage))}
      on conflict (id) do update
      set asset_id = excluded.asset_id,
          image_url = excluded.image_url,
          title = excluded.title,
          subtitle = excluded.subtitle,
          prompt = excluded.prompt,
          composition_json = excluded.composition_json,
          status = excluded.status
    `;
    await tx`update collections set og_image_id = ${input.ogImage.id} where id = ${input.collectionId}`;
  });
  return getDropBundleByDropId(input.dropId);
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

export async function startDnsClaim(storefrontId: string, input: { claimantWallet?: string | null; claimantEmail?: string | null; claimantName?: string | null }): Promise<Claim> {
  const bundle = await getStorefrontBundleById(storefrontId);
  if (!bundle || !bundle.drop) throw new Error("Drop not found.");
  const dropRecord = bundle.drop;
  const token = dropRecord.dnsClaimNonce || newId("dns").replace(/^dns_/, "");
  const rootDomain = dropRecord.canonicalRootDomain || dropRecord.registrableDomain || dropRecord.canonicalDomain;
  const txtName = `_droplink.${rootDomain}`;
  const txtValue = `droplink-claim=${token}`;
  const claim: Claim = {
    id: newId("clm"),
    storefrontId,
    dropId: dropRecord.id,
    hostname: rootDomain,
    txtName,
    txtValue,
    claimantWallet: input.claimantWallet || null,
    claimantEmail: input.claimantEmail || null,
    claimantName: input.claimantName || null,
    proofJson: null,
    status: "pending",
    verifiedAt: null,
    createdAt: nowIso()
  };
  if (!usePostgres()) {
    await mutateStore((data) => {
      data.claims.push(claim);
      const storefront = data.storefronts.find((entry) => entry.id === storefrontId);
      const drop = data.drops.find((entry) => entry.id === dropRecord.id);
      if (storefront) {
        storefront.claimStatus = "pending_dns";
        storefront.updatedAt = nowIso();
      }
      if (drop) {
        drop.dnsClaimNonce = token;
        drop.dnsRecordName = txtName;
        drop.dnsRecordValue = txtValue;
        drop.domainOwnerEmail = input.claimantEmail || drop.domainOwnerEmail || null;
        drop.domainOwnerName = input.claimantName || drop.domainOwnerName || null;
        drop.updatedAt = nowIso();
      }
    });
    return claim;
  }
  await sql().begin(async (tx) => {
    await tx`insert into claims ${tx(toSnake(claim))}`;
    await tx`update storefronts set claim_status = 'pending_dns', updated_at = now() where id = ${storefrontId}`;
    await tx`
      update drops
      set dns_claim_nonce = ${token},
          dns_record_name = ${txtName},
          dns_record_value = ${txtValue},
          domain_owner_email = ${input.claimantEmail || null},
          domain_owner_name = ${input.claimantName || null},
          updated_at = now()
      where id = ${dropRecord.id}
    `;
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

export async function verifyDropClaim(dropId: string): Promise<Claim> {
  const bundle = await getDropBundleByDropId(dropId);
  if (!bundle?.drop) throw new Error("Drop not found.");
  const claim = [...(await (async () => {
    if (!usePostgres()) {
      const data = await readStore();
      return data.claims.filter((entry) => entry.dropId === dropId || entry.storefrontId === bundle.storefront.id);
    }
    const rows = await sql()`select * from claims where drop_id = ${dropId} or storefront_id = ${bundle.storefront.id} order by created_at desc`;
    return rows.map((entry) => row<Claim>(toCamel(entry)));
  })())].find((entry) => entry.status === "pending");
  if (!claim) throw new Error("No pending DNS claim exists.");
  if (!bundle.drop.dnsClaimNonce || !bundle.drop.dnsRecordName) throw new Error("DNS claim nonce is missing.");
  const proof = await verifyDroplinkDnsNonce(bundle.drop.dnsRecordName, bundle.drop.dnsClaimNonce);
  if (!proof.ok) {
    await recordEvent({
      entityType: "drop",
      entityId: dropId,
      eventType: "dns_claim_failed",
      level: "warn",
      message: "DNS TXT record was not found or did not match nonce.",
      metadataJson: { txtName: bundle.drop.dnsRecordName, records: proof.records },
      requestId: null,
      traceId: bundle.storefront.generationTraceId || null
    });
    throw new Error("DNS TXT record has not propagated or does not match the expected nonce.");
  }
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === dropId);
      const storefront = data.storefronts.find((entry) => entry.id === bundle.storefront.id);
      const entry = data.claims.find((item) => item.id === claim.id);
      if (entry) {
        entry.status = "verified";
        entry.verifiedAt = nowIso();
        entry.proofJson = { records: proof.records };
      }
      if (drop) {
        drop.status = "claimed";
        drop.domainClaimStatus = "verified";
        drop.publishStatus = "blocked";
        drop.domainOwnerEmail = claim.claimantEmail || null;
        drop.domainOwnerName = claim.claimantName || null;
        drop.domainClaimProofJson = { records: proof.records };
        drop.domainClaimedAt = nowIso();
        drop.updatedAt = nowIso();
      }
      if (storefront) {
        storefront.status = "claimed";
        storefront.claimStatus = "verified";
        storefront.updatedAt = nowIso();
      }
    });
  } else {
    const claimantEmail = claim.claimantEmail || null;
    const claimantName = claim.claimantName || null;
    await sql().begin(async (tx) => {
      await tx`
        update claims
        set status = 'verified', verified_at = now(), proof_json = ${JSON.stringify({ records: proof.records })}::jsonb
        where id = ${claim.id}
      `;
      await tx`
        update drops
        set status = 'claimed',
            domain_claim_status = 'verified',
            publish_status = 'blocked',
            domain_owner_email = ${claimantEmail},
            domain_owner_name = ${claimantName},
            domain_claim_proof_json = ${JSON.stringify({ records: proof.records })}::jsonb,
            domain_claimed_at = now(),
            updated_at = now()
        where id = ${dropId}
      `;
      await tx`update storefronts set status = 'claimed', claim_status = 'verified', updated_at = now() where id = ${bundle.storefront.id}`;
    });
  }
  await recordEvent({
    entityType: "drop",
    entityId: dropId,
    eventType: "dns_claim_verified",
    level: "info",
    message: "DNS TXT proof verified; drop is claimed.",
    metadataJson: { canonicalRootDomain: bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain, claimantEmail: claim.claimantEmail || null },
    requestId: null,
    traceId: bundle.storefront.generationTraceId || null
  });
  return { ...claim, status: "verified", verifiedAt: nowIso(), proofJson: { records: proof.records } };
}

function assertDropClaimedForPayout(drop: Drop) {
  if (drop.status !== "claimed" && drop.status !== "published") throw new Error("DropLink must be claimed before payout setup.");
  if (drop.domainClaimStatus !== "verified") throw new Error("Domain claim must be verified before payout setup.");
}

function assertWalletAddress(walletAddress: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) throw new Error("walletAddress must be a valid EVM address.");
}

export async function startTempoPayout(dropId: string, input: { walletAddress: string; chain?: string }) {
  const bundle = await getDropBundleByDropId(dropId);
  if (!bundle?.drop) throw new Error("Drop not found.");
  assertDropClaimedForPayout(bundle.drop);
  assertWalletAddress(input.walletAddress);
  const chain = input.chain || "tempo";
  const nonce = newId("pay").replace(/^pay_/, "");
  const rootDomain = bundle.drop.canonicalRootDomain || bundle.drop.registrableDomain || bundle.drop.canonicalDomain;
  const txtName = `_droplink-payout.${rootDomain}`;
  const txtValue = `droplink-payout=${dropId}; nonce=${nonce}; wallet=${input.walletAddress}; chain=${chain}`;
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === dropId);
      if (!drop) return;
      drop.payoutNonce = nonce;
      drop.payoutDnsRecordName = txtName;
      drop.payoutDnsRecordValue = txtValue;
      drop.tempoWalletAddress = input.walletAddress;
      drop.payoutMethod = "tempo_wallet";
      drop.payoutStatus = "missing";
      drop.updatedAt = nowIso();
    });
  } else {
    await sql()`
      update drops
      set payout_nonce = ${nonce},
          payout_dns_record_name = ${txtName},
          payout_dns_record_value = ${txtValue},
          tempo_wallet_address = ${input.walletAddress},
          payout_method = 'tempo_wallet',
          payout_status = 'missing',
          updated_at = now()
      where id = ${dropId}
    `;
  }
  return { dropId, canonicalRootDomain: rootDomain, txtName, txtValue, walletAddress: input.walletAddress, chain };
}

export async function verifyTempoPayout(dropId: string) {
  const bundle = await getDropBundleByDropId(dropId);
  if (!bundle?.drop) throw new Error("Drop not found.");
  assertDropClaimedForPayout(bundle.drop);
  if (!bundle.drop.payoutNonce || !bundle.drop.payoutDnsRecordName || !bundle.drop.tempoWalletAddress) {
    throw new Error("Tempo payout setup has not been started.");
  }
  const proof = await verifyDroplinkPayoutDns(bundle.drop.payoutDnsRecordName, {
    dropId,
    nonce: bundle.drop.payoutNonce,
    wallet: bundle.drop.tempoWalletAddress,
    chain: "tempo"
  });
  if (!proof.ok) throw new Error("DNS payout TXT record has not propagated or does not match drop id, nonce, wallet, and chain.");
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === dropId);
      if (!drop) return;
      drop.payoutStatus = "tempo_wallet_ready";
      drop.payoutMethod = "tempo_wallet";
      drop.tempoWalletVerifiedAt = nowIso();
      drop.tempoWalletVerificationProofJson = { records: proof.records };
      drop.payoutConfiguredAt = nowIso();
      drop.updatedAt = nowIso();
    });
  } else {
    await sql()`
      update drops
      set payout_status = 'tempo_wallet_ready',
          payout_method = 'tempo_wallet',
          tempo_wallet_verified_at = now(),
          tempo_wallet_verification_proof_json = ${JSON.stringify({ records: proof.records })}::jsonb,
          payout_configured_at = now(),
          updated_at = now()
      where id = ${dropId}
    `;
  }
  await recordEvent({
    entityType: "drop",
    entityId: dropId,
    eventType: "tempo_payout_verified",
    level: "info",
    message: "Tempo payout wallet verified with fresh DNS proof.",
    metadataJson: { walletAddress: bundle.drop.tempoWalletAddress },
    requestId: null,
    traceId: bundle.storefront.generationTraceId || null
  });
  return { ok: true, proof };
}

export async function startStripeConnectPayout(dropId: string, input: { baseUrl: string }) {
  const bundle = await getDropBundleByDropId(dropId);
  if (!bundle?.drop) throw new Error("Drop not found.");
  assertDropClaimedForPayout(bundle.drop);
  const { stripeClient } = await import("./stripe");
  const stripe = stripeClient();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY is required for Stripe Connect payout setup.");
  let accountId = bundle.drop.stripeConnectAccountId || null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: bundle.drop.domainOwnerEmail || undefined,
      metadata: { dropId, canonicalRootDomain: bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain }
    });
    accountId = account.id;
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${input.baseUrl.replace(/\/$/, "")}/${bundle.storefront.slug}?payout=refresh`,
    return_url: `${input.baseUrl.replace(/\/$/, "")}/${bundle.storefront.slug}?payout=return`,
    type: "account_onboarding"
  });
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === dropId);
      if (!drop) return;
      drop.stripeConnectAccountId = accountId;
      drop.stripeConnectOnboardingUrl = link.url;
      drop.stripeConnectStatus = "onboarding";
      drop.payoutMethod = "stripe_connect";
      drop.payoutStatus = "missing";
      drop.updatedAt = nowIso();
    });
  } else {
    await sql()`
      update drops
      set stripe_connect_account_id = ${accountId},
          stripe_connect_onboarding_url = ${link.url},
          stripe_connect_status = 'onboarding',
          payout_method = 'stripe_connect',
          payout_status = 'missing',
          updated_at = now()
      where id = ${dropId}
    `;
  }
  return { accountId, onboardingUrl: link.url };
}

export async function updateStripeConnectPayoutStatus(input: {
  accountId: string;
  payoutsEnabled: boolean;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.stripeConnectAccountId === input.accountId);
      if (!drop) return;
      drop.stripeConnectStatus = input.payoutsEnabled ? "ready" : input.detailsSubmitted ? "submitted" : "pending";
      if (input.payoutsEnabled) {
        drop.payoutStatus = "stripe_connect_ready";
        drop.payoutMethod = "stripe_connect";
        drop.stripeConnectVerifiedAt = nowIso();
        drop.payoutConfiguredAt = drop.payoutConfiguredAt || nowIso();
      }
      drop.updatedAt = nowIso();
    });
    return;
  }
  await sql()`
    update drops
    set stripe_connect_status = ${input.payoutsEnabled ? "ready" : input.detailsSubmitted ? "submitted" : "pending"},
        payout_status = case when ${input.payoutsEnabled} then 'stripe_connect_ready' else payout_status end,
        payout_method = case when ${input.payoutsEnabled} then 'stripe_connect' else payout_method end,
        stripe_connect_verified_at = case when ${input.payoutsEnabled} then now() else stripe_connect_verified_at end,
        payout_configured_at = case when ${input.payoutsEnabled} then coalesce(payout_configured_at, now()) else payout_configured_at end,
        updated_at = now()
    where stripe_connect_account_id = ${input.accountId}
  `;
}

export async function getRelicCheckoutContext(relicId: string) {
  const bundles = await listStorefrontBundles();
  for (const bundle of bundles) {
    const relic = bundle.relics.find((entry) => entry.id === relicId);
    if (relic && bundle.activeCollection) return { bundle, collection: bundle.activeCollection, relic };
  }
  return null;
}

export function finiteDropRelicCount() {
  return dropConfig.relicsPerDrop;
}
