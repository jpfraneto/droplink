import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { sql, usePostgres } from "./db";
import { verifyDroplinkDnsNonce, verifyDroplinkPayoutDns } from "./dnsClaim";
import { sendEmail } from "./email";
import { checkoutConfig, dropConfig, tempoReadiness } from "./env";
import { calculateWaterfall } from "./economics";
import { newId } from "./hashes";
import { priceBookProfitBlockers, priceBookRelicPriceCents } from "./pricing";
import { validateProducts } from "./productValidation";
import { revenueSplitForDrop, SCOUT_BPS } from "./protocol";
import type {
  AdminReview,
  AppSetting,
  AppUser,
  Asset,
  Brand,
  BrandSnapshot,
  BrandStudy,
  CheckoutSession,
  Claim,
  Collection,
  Drop,
  DropNotification,
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
  ScoutCheckoutSession,
  StoreData,
  Storefront,
  StorefrontBundle,
  StripeEventRecord,
  StripeTransfer,
  SystemEvent
} from "./types";

function dataFile() {
  return process.env.DROPLINK_DATA_FILE || path.join(process.cwd(), "data", "store.json");
}

export const emptyStore: StoreData = {
  users: [],
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
  dropNotifications: [],
  checkoutSessions: [],
  scoutCheckoutSessions: [],
  stripeEvents: [],
  orders: [],
  ledgerEntries: [],
  ledgerAccruals: [],
  fulfillmentOrders: [],
  stripeAccounts: [],
  appSettings: [],
  stripeTransfers: [],
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
    users: input.users || [],
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
    dropNotifications: input.dropNotifications || [],
    checkoutSessions: input.checkoutSessions || [],
    scoutCheckoutSessions: input.scoutCheckoutSessions || [],
    stripeEvents: input.stripeEvents || [],
    orders: input.orders || [],
    ledgerEntries: input.ledgerEntries || [],
    ledgerAccruals: input.ledgerAccruals || [],
    fulfillmentOrders: input.fulfillmentOrders || [],
    stripeAccounts: input.stripeAccounts || [],
    appSettings: input.appSettings || [],
    stripeTransfers: input.stripeTransfers || [],
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
  const scoutUser = drop?.scoutUserId ? data.users.find((entry) => entry.id === drop.scoutUserId) || null : null;
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
    scoutUser,
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
  const [scoutUserRow] = dropRow?.scout_user_id ? await db`select * from app_users where id = ${dropRow.scout_user_id} limit 1` : [];
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
    scoutUser: scoutUserRow ? row<AppUser>(toCamel(scoutUserRow)) : null,
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

export async function saveScoutShell(input: {
  brand: Brand;
  storefront: Storefront;
  drop: Drop;
  sourceSignal: DropSourceSignal;
  job: GenerationJob;
}): Promise<StorefrontBundle> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      data.brands.push(input.brand);
      data.storefronts.push(input.storefront);
      data.drops.push(input.drop);
      data.dropSourceSignals.push(input.sourceSignal);
      const existingJob = data.generationJobs.find((entry) => entry.id === input.job.id);
      if (existingJob) Object.assign(existingJob, input.job);
      else data.generationJobs.push(input.job);
      const hydrated = hydrateBundle(data, input.storefront);
      if (!hydrated) throw new Error("Scout storefront could not be hydrated.");
      return hydrated;
    });
  }

  const db = sql();
  await db.begin(async (tx) => {
    await tx`insert into brands ${tx(toSnake(input.brand))}`;
    await tx`insert into storefronts ${tx(toSnake(input.storefront))}`;
    await tx`insert into drops ${tx(toSnake(input.drop))}`;
    await tx`insert into drop_source_signals ${tx(toSnake(input.sourceSignal))}`;
    await tx`
      insert into generation_jobs ${tx(toSnake(input.job))}
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
  const hydrated = await getStorefrontBundleById(input.storefront.id);
  if (!hydrated) throw new Error("Scout storefront could not be loaded after save.");
  return hydrated;
}

function toCamel(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camel] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export type ScoutProfile = {
  user: AppUser;
  totalScouts: number;
  allTimeEarningsCents: number;
  scouts: Array<{
    dropId: string;
    slug: string;
    domain: string;
    title: string;
    status: string;
    createdAt: string;
    scoutEarningsCents: number;
  }>;
};

export async function upsertAppUser(input: {
  xId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}): Promise<AppUser> {
  const now = nowIso();
  const cleanUsername = normalizeUsername(input.username);
  if (!cleanUsername) throw new Error("X did not return a username.");
  const profileUrl = `https://x.com/${cleanUsername}`;
  const avatarUrl = input.avatarUrl || null;
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.users.find((entry) => entry.xId === input.xId || normalizeUsername(entry.username) === cleanUsername);
      if (existing) {
        existing.xId = input.xId;
        existing.username = cleanUsername;
        existing.displayName = input.displayName || cleanUsername;
        existing.avatarUrl = avatarUrl;
        existing.profileUrl = profileUrl;
        existing.lastLoginAt = now;
        existing.updatedAt = now;
        return existing;
      }
      const user: AppUser = {
        id: newId("usr"),
        xId: input.xId,
        username: cleanUsername,
        displayName: input.displayName || cleanUsername,
        avatarUrl,
        profileUrl,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      };
      data.users.push(user);
      return user;
    });
  }
  const user: AppUser = {
    id: newId("usr"),
    xId: input.xId,
    username: cleanUsername,
    displayName: input.displayName || cleanUsername,
    avatarUrl,
    profileUrl,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };
  const [existing] = await sql()`
    select * from app_users
    where x_id = ${input.xId} or lower(username) = ${cleanUsername}
    limit 1
  `;
  const [rowValue] = existing
    ? await sql()`
        update app_users
        set x_id = ${input.xId},
            username = ${cleanUsername},
            display_name = ${user.displayName},
            avatar_url = ${avatarUrl},
            profile_url = ${profileUrl},
            last_login_at = ${now},
            updated_at = ${now}
        where id = ${existing.id}
        returning *
      `
    : await sql()`
        insert into app_users ${sql()(toSnake(user))}
        returning *
      `;
  return row<AppUser>(toCamel(rowValue));
}

export async function getAppUserById(id: string): Promise<AppUser | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.users.find((entry) => entry.id === id) || null;
  }
  const [user] = await sql()`select * from app_users where id = ${id} limit 1`;
  return user ? row<AppUser>(toCamel(user)) : null;
}

export async function getAppUserByUsername(username: string): Promise<AppUser | null> {
  const cleanUsername = normalizeUsername(username);
  if (!usePostgres()) {
    const data = await readStore();
    return data.users.find((entry) => normalizeUsername(entry.username) === cleanUsername) || null;
  }
  const [user] = await sql()`select * from app_users where lower(username) = ${cleanUsername} limit 1`;
  return user ? row<AppUser>(toCamel(user)) : null;
}

export async function getScoutProfileByUsername(username: string): Promise<ScoutProfile | null> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) return null;
  if (!usePostgres()) {
    const data = await readStore();
    const user =
      data.users.find((entry) => normalizeUsername(entry.username) === cleanUsername) ||
      ({
        id: `legacy_${cleanUsername}`,
        xId: `legacy_${cleanUsername}`,
        username: cleanUsername,
        displayName: `@${cleanUsername}`,
        avatarUrl: null,
        profileUrl: `https://x.com/${cleanUsername}`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastLoginAt: null
      } satisfies AppUser);
    const drops = data.drops.filter(
      (entry) =>
        entry.scoutUserId === user.id ||
        normalizeUsername(entry.creatorDisplayName || "") === cleanUsername
    );
    if (!drops.length && user.id.startsWith("legacy_")) return null;
    const scouts = drops
      .map((drop) => {
        const storefront = data.storefronts.find((entry) => entry.id === drop.storefrontId);
        const brand = storefront ? data.brands.find((entry) => entry.id === storefront.brandId) : null;
        const scoutEarningsCents = data.ledgerAccruals
          .filter((entry) => entry.dropId === drop.id && entry.beneficiaryType === "creator")
          .reduce((sum, entry) => sum + Math.round(entry.amount), 0);
        return {
          dropId: drop.id,
          slug: storefront?.slug || "",
          domain: drop.canonicalRootDomain || drop.canonicalDomain || brand?.hostname || "unknown",
          title: brand?.name || drop.canonicalRootDomain || drop.canonicalDomain,
          status: drop.status,
          createdAt: drop.createdAt,
          scoutEarningsCents
        };
      })
      .filter((entry) => entry.slug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      user,
      totalScouts: scouts.length,
      allTimeEarningsCents: scouts.reduce((sum, entry) => sum + entry.scoutEarningsCents, 0),
      scouts
    };
  }
  const user = await getAppUserByUsername(cleanUsername);
  const rows = user
    ? await sql()`
        select d.id as drop_id,
               s.slug,
               coalesce(d.canonical_root_domain, d.canonical_domain, b.hostname) as domain,
               b.name as title,
               d.status,
               d.created_at,
               coalesce(sum(case when la.beneficiary_type = 'creator' then la.amount else 0 end), 0) as scout_earnings_cents
        from drops d
        join storefronts s on s.id = d.storefront_id
        join brands b on b.id = s.brand_id
        left join ledger_accruals la on la.drop_id = d.id
        where d.scout_user_id = ${user.id}
           or lower(trim(leading '@' from coalesce(d.creator_display_name, ''))) = ${cleanUsername}
        group by d.id, s.slug, b.hostname, b.name
        order by d.created_at desc
      `
    : await sql()`
        select d.id as drop_id,
               s.slug,
               coalesce(d.canonical_root_domain, d.canonical_domain, b.hostname) as domain,
               b.name as title,
               d.status,
               d.created_at,
               coalesce(sum(case when la.beneficiary_type = 'creator' then la.amount else 0 end), 0) as scout_earnings_cents
        from drops d
        join storefronts s on s.id = d.storefront_id
        join brands b on b.id = s.brand_id
        left join ledger_accruals la on la.drop_id = d.id
        where lower(trim(leading '@' from coalesce(d.creator_display_name, ''))) = ${cleanUsername}
        group by d.id, s.slug, b.hostname, b.name
        order by d.created_at desc
      `;
  if (!user && !rows.length) return null;
  const profileUser =
    user ||
    ({
      id: `legacy_${cleanUsername}`,
      xId: `legacy_${cleanUsername}`,
      username: cleanUsername,
      displayName: `@${cleanUsername}`,
      avatarUrl: null,
      profileUrl: `https://x.com/${cleanUsername}`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: null
    } satisfies AppUser);
  const scouts = rows.map((entry) => ({
    dropId: String(entry.drop_id),
    slug: String(entry.slug),
    domain: String(entry.domain),
    title: String(entry.title),
    status: String(entry.status),
    createdAt: entry.created_at instanceof Date ? entry.created_at.toISOString() : String(entry.created_at),
    scoutEarningsCents: Math.round(Number(entry.scout_earnings_cents || 0))
  }));
  return {
    user: profileUser,
    totalScouts: scouts.length,
    allTimeEarningsCents: scouts.reduce((sum, entry) => sum + entry.scoutEarningsCents, 0),
    scouts
  };
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
      const replace = <T extends { id: string }>(rows: T[], entry: T) => {
        const index = rows.findIndex((row) => row.id === entry.id);
        if (index >= 0) rows[index] = entry;
        else rows.push(entry);
      };
      if (bundle.drop) replace(data.drops, bundle.drop);
      if (bundle.sourceSignals) {
        for (const signal of bundle.sourceSignals) replace(data.dropSourceSignals, signal);
      }
      replace(data.brands, bundle.brand);
      replace(data.storefronts, bundle.storefront);
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
    await tx`
      insert into brands ${tx(toSnake(bundle.brand))}
      on conflict (id) do update
      set canonical_url = excluded.canonical_url,
          hostname = excluded.hostname,
          slug = excluded.slug,
          name = excluded.name,
          updated_at = excluded.updated_at
    `;
    await tx`
      insert into storefronts ${tx(toSnake(bundle.storefront))}
      on conflict (id) do update
      set brand_id = excluded.brand_id,
          slug = excluded.slug,
          status = excluded.status,
          claim_status = excluded.claim_status,
          commerce_mode = excluded.commerce_mode,
          commission_bps = excluded.commission_bps,
          custom_domain = excluded.custom_domain,
          stripe_connected_account_id = excluded.stripe_connected_account_id,
          generation_status = excluded.generation_status,
          generation_trace_id = excluded.generation_trace_id,
          updated_at = excluded.updated_at,
          published_at = excluded.published_at
    `;
    if (bundle.drop) {
      await tx`
        insert into drops ${tx(toSnake(bundle.drop))}
        on conflict (id) do update
        set storefront_id = excluded.storefront_id,
            scout_user_id = excluded.scout_user_id,
            original_submitted_url = excluded.original_submitted_url,
            submitted_host = excluded.submitted_host,
            submitted_path = excluded.submitted_path,
            source_url = excluded.source_url,
            canonical_url = excluded.canonical_url,
            canonical_domain = excluded.canonical_domain,
            canonical_root_domain = excluded.canonical_root_domain,
            registrable_domain = excluded.registrable_domain,
            root_domain_hash = excluded.root_domain_hash,
            domain_hash = excluded.domain_hash,
            status = excluded.status,
            domain_claim_status = case when drops.domain_claim_status = 'verified' then drops.domain_claim_status else excluded.domain_claim_status end,
            payout_status = excluded.payout_status,
            payout_method = excluded.payout_method,
            publish_status = excluded.publish_status,
            summoner_wallet = excluded.summoner_wallet,
            creator_display_name = excluded.creator_display_name,
            summon_payment_tx_hash = excluded.summon_payment_tx_hash,
            summon_payment_metadata_json = excluded.summon_payment_metadata_json,
            summon_price_usdc = excluded.summon_price_usdc,
            creator_bounty_bps = excluded.creator_bounty_bps,
            protocol_fee_bps = excluded.protocol_fee_bps,
            total_supply = excluded.total_supply,
            relics_per_drop = excluded.relics_per_drop,
            editions_per_relic = excluded.editions_per_relic,
            dns_claim_nonce = coalesce(drops.dns_claim_nonce, excluded.dns_claim_nonce),
            dns_record_name = coalesce(drops.dns_record_name, excluded.dns_record_name),
            dns_record_value = coalesce(drops.dns_record_value, excluded.dns_record_value),
            domain_owner_name = coalesce(drops.domain_owner_name, excluded.domain_owner_name),
            domain_owner_wallet = coalesce(drops.domain_owner_wallet, excluded.domain_owner_wallet),
            domain_owner_email = coalesce(drops.domain_owner_email, excluded.domain_owner_email),
            domain_claim_proof_json = coalesce(drops.domain_claim_proof_json, excluded.domain_claim_proof_json),
            domain_claimed_at = coalesce(drops.domain_claimed_at, excluded.domain_claimed_at),
            price_book_json = excluded.price_book_json,
            projected_economics_json = excluded.projected_economics_json,
            price_book_locked_at = excluded.price_book_locked_at,
            readiness_json = excluded.readiness_json,
            updated_at = excluded.updated_at
      `;
    }
    for (const signal of bundle.sourceSignals || []) {
      await tx`
        insert into drop_source_signals ${tx(toSnake(signal))}
        on conflict (id) do nothing
      `;
    }
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

function appBaseUrl() {
  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function emailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

async function sendLaunchEmail(input: { to: string; domain: string; url: string; productName?: string | null }) {
  const subject = `${input.domain} is live on DropLink`;
  const domain = escapeHtml(input.domain);
  const productName = input.productName ? escapeHtml(input.productName) : null;
  const productLine = productName ? `<p>The item you asked about, <strong>${productName}</strong>, is now available.</p>` : "";
  const textProductLine = input.productName ? `\n\nThe item you asked about, ${input.productName}, is now available.` : "";
  return sendEmail({
    to: input.to,
    subject,
    html: `<p>${domain} has claimed and activated its DropLink.</p>${productLine}<p><a href="${escapeHtml(input.url)}">Open the drop</a></p>`,
    text: `${input.domain} has claimed and activated its DropLink.${textProductLine}\n\nOpen the drop: ${input.url}`
  });
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

export async function getAppSetting(key: string): Promise<AppSetting | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.appSettings.find((entry) => entry.key === key) || null;
  }
  const [setting] = await sql()`select * from app_settings where key = ${key} limit 1`;
  return setting ? row<AppSetting>(toCamel(setting)) : null;
}

export async function setAppSetting(key: string, valueJson: Record<string, unknown>): Promise<AppSetting> {
  const setting: AppSetting = { key, valueJson, createdAt: nowIso(), updatedAt: nowIso() };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.appSettings.find((entry) => entry.key === key);
      if (existing) {
        existing.valueJson = valueJson;
        existing.updatedAt = nowIso();
        return existing;
      }
      data.appSettings.push(setting);
      return setting;
    });
  }
  const [updated] = await sql()`
    insert into app_settings ${sql()(toSnake(setting))}
    on conflict (key) do update
    set value_json = excluded.value_json, updated_at = now()
    returning *
  `;
  return row<AppSetting>(toCamel(updated));
}

export async function checkoutPauseState(): Promise<{ paused: boolean; reason: string | null; source: "env" | "db" | null }> {
  if (checkoutConfig.globallyPaused) return { paused: true, reason: "DROPLINK_CHECKOUT_PAUSED=true", source: "env" };
  const setting = await getAppSetting("checkout_pause");
  const value = setting?.valueJson || {};
  return {
    paused: Boolean(value.paused),
    reason: typeof value.reason === "string" ? value.reason : null,
    source: value.paused ? "db" : null
  };
}

export async function createDropNotification(input: {
  dropId: string;
  relicId?: string | null;
  email: string;
  source?: string;
  metadataJson?: Record<string, unknown> | null;
}): Promise<DropNotification> {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Enter a valid email address.");
  const now = nowIso();
  const notification: DropNotification = {
    id: newId("not"),
    dropId: input.dropId,
    relicId: input.relicId || null,
    email: cleanEmail,
    status: "pending",
    source: input.source || "preview_buy_modal",
    notifiedAt: null,
    metadataJson: {
      ...(input.metadataJson || {}),
      emailHash: emailHash(cleanEmail)
    },
    createdAt: now,
    updatedAt: now
  };
  if (!usePostgres()) {
    await mutateStore((data) => {
      const existing = data.dropNotifications.find(
        (entry) => entry.dropId === notification.dropId && (entry.relicId || null) === (notification.relicId || null) && entry.email.toLowerCase() === cleanEmail
      );
      if (existing) {
        existing.status = existing.status === "unsubscribed" ? "unsubscribed" : "pending";
        existing.updatedAt = nowIso();
        return;
      }
      data.dropNotifications.push(notification);
    });
    return notification;
  }
  const [rowValue] = await sql()`
    insert into drop_notifications ${sql()(toSnake(notification))}
    on conflict (drop_id, relic_id, email) do update
    set status = case when drop_notifications.status = 'unsubscribed' then 'unsubscribed' else 'pending' end,
        updated_at = now(),
        metadata_json = excluded.metadata_json
    returning *
  `;
  return row<DropNotification>(toCamel(rowValue));
}

export async function sendDropLiveNotifications(dropId: string): Promise<{ attempted: number; sent: number; skipped: number }> {
  const bundle = await getDropBundleByDropId(dropId);
  if (!bundle?.drop) throw new Error("Drop not found.");
  const domain = bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain || bundle.brand.hostname;
  const url = `${appBaseUrl()}/${bundle.storefront.slug}`;
  if (!usePostgres()) {
    const data = await readStore();
    const pending = data.dropNotifications.filter((entry) => entry.dropId === dropId && entry.status === "pending");
    return { attempted: pending.length, sent: 0, skipped: pending.length };
  }
  const rows = await sql()`
    select n.*, r.name as relic_name
    from drop_notifications n
    left join relics r on r.id = n.relic_id
    where n.drop_id = ${dropId} and n.status = 'pending'
    order by n.created_at asc
  `;
  let sent = 0;
  let skipped = 0;
  for (const entry of rows) {
    try {
      const result = await sendLaunchEmail({
        to: String(entry.email),
        domain,
        url,
        productName: typeof entry.relic_name === "string" ? entry.relic_name : null
      });
      if (result.sent) {
        sent += 1;
        await sql()`update drop_notifications set status = 'sent', notified_at = now(), updated_at = now() where id = ${entry.id}`;
        await recordEvent({
          entityType: "drop",
          entityId: dropId,
          eventType: "launch_notification_sent",
          level: "info",
          message: "Launch notification email sent.",
          metadataJson: {
            notificationId: entry.id,
            emailHash: emailHash(String(entry.email)),
            provider: result.provider,
            from: result.from
          },
          requestId: null,
          traceId: bundle.storefront.generationTraceId || null
        });
      } else {
        skipped += 1;
        await recordEvent({
          entityType: "drop",
          entityId: dropId,
          eventType: "launch_notification_skipped",
          level: "warn",
          message: result.reason || "Launch email provider is not configured.",
          metadataJson: { notificationId: entry.id },
          requestId: null,
          traceId: bundle.storefront.generationTraceId || null
        });
      }
    } catch (error) {
      skipped += 1;
      await sql()`update drop_notifications set status = 'failed', updated_at = now() where id = ${entry.id}`;
      await recordEvent({
        entityType: "drop",
        entityId: dropId,
        eventType: "launch_notification_failed",
        level: "error",
        message: error instanceof Error ? error.message : "Launch notification failed.",
        metadataJson: { notificationId: entry.id },
        requestId: null,
        traceId: bundle.storefront.generationTraceId || null
      });
    }
  }
  return { attempted: rows.length, sent, skipped };
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
  if (!readiness.ready) {
    await recordEvent({
      entityType: "drop",
      entityId: bundle.drop.id,
      eventType: "publish_blocked",
      level: "warn",
      message: `Publish blocked: ${readiness.blockers.join(", ")}`,
      metadataJson: {
        blockers: readiness.blockers,
        validation: readiness.validation
      },
      requestId: null,
      traceId: bundle.storefront.generationTraceId || null
    });
    throw new Error(`Storefront is not ready to publish: ${readiness.blockers.join(", ")}`);
  }
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
      drop.creatorBountyBps = revenueSplitForDrop(drop).scoutBps;
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
          creator_bounty_bps = case
            when nullif(summoner_wallet, '') is null then 0
            when lower(coalesce(summoner_wallet, '')) = lower(coalesce(domain_owner_wallet, '')) then 0
            else ${SCOUT_BPS}
          end,
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
  if (published.drop?.id) {
    await sendDropLiveNotifications(published.drop.id).catch((error) =>
      recordEvent({
        entityType: "drop",
        entityId: published.drop?.id || storefrontId,
        eventType: "launch_notifications_failed",
        level: "error",
        message: error instanceof Error ? error.message : "Launch notifications failed.",
        metadataJson: {},
        requestId: null,
        traceId: published.storefront.generationTraceId || null
      })
    );
  }
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

export async function setDropCheckoutPaused(input: { dropId: string; paused: boolean; reason?: string | null }): Promise<Drop | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === input.dropId);
      if (!drop) return null;
      drop.checkoutPaused = input.paused;
      drop.checkoutPauseReason = input.reason || null;
      drop.updatedAt = nowIso();
      return drop;
    });
  }
  const [updated] = await sql()`
    update drops
    set checkout_paused = ${input.paused},
        checkout_pause_reason = ${input.reason || null},
        updated_at = now()
    where id = ${input.dropId}
    returning *
  `;
  return updated ? row<Drop>(toCamel(updated)) : null;
}

export function reviewReadiness(bundle: StorefrontBundle): {
  ready: boolean;
  blockers: string[];
  checklist: Record<string, boolean>;
  validation: ReturnType<typeof validateProducts>;
} {
  const collection = bundle.activeCollection;
  const relics = bundle.relics;
  const editionsByRelic = new Map<string, number>();
  for (const edition of bundle.editions) editionsByRelic.set(edition.relicId, (editionsByRelic.get(edition.relicId) || 0) + 1);
  const tempo = tempoReadiness();
  const priceBook = bundle.drop?.priceBookJson || null;
  const priceBlockers = priceBookProfitBlockers(priceBook);
  const validation = validateProducts({
    brand: bundle.brand,
    drop: bundle.drop,
    storefront: bundle.storefront,
    relics,
    assets: bundle.assets
  });
  const hasReadyMockup = (relicId: string) =>
    bundle.mockups.some((mockup) => mockup.relicId === relicId && mockup.status === "ready" && /^https:\/\//i.test(mockup.imageUrl) && !mockup.imageUrl.includes("/api/mockups/"));
  const productionGuardsEnabled = process.env.NODE_ENV === "production" || process.env.DROPLINK_PRODUCTION_GUARDS === "true";
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
    x402SummonConfigured: true,
    tempoSettlementStatusVisible: Boolean(tempo.ready || tempo.missing.length),
    urlCrawled: Boolean(bundle.brandStudy),
    brandStudyGenerated: Boolean(bundle.brandStudy),
    relicPlanValid: Boolean(bundle.relicPlan && collection && bundle.relicPlan.planJson.relics.length === dropConfig.relicsPerDrop),
    printfulVariantSelected: relics.every((relic) => Boolean(relic.printfulProductId && relic.printfulVariantId)),
    printFilesGenerated: relics.every((relic) => bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file")),
    printFilesValid: relics.every((relic) =>
      bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.validationStatus === "valid")
    ),
    dropCheckoutNotPaused: !bundle.drop?.checkoutPaused,
    shippingEconomicsExplicit: checkoutConfig.shippingMode === "included" || (checkoutConfig.shippingMode === "fixed" && checkoutConfig.fixedShippingAmountCents > 0),
    stripeTaxModeVisible: true,
    payoutAccountCreated: !dropConfig.requirePayoutBeforePublish || Boolean(bundle.drop?.stripeConnectAccountId),
    payoutAccountPayoutsEnabled: !dropConfig.requirePayoutBeforePublish || Boolean(bundle.drop?.stripeConnectPayoutsEnabled),
    payoutCanBeHeldIfMissing: !dropConfig.requirePayoutBeforePublish,
    lifestyleImagesGenerated: relics.every((relic) => bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "lifestyle") || hasReadyMockup(relic.id)),
    lifestyleImagesValid: relics.every((relic) =>
      bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "lifestyle" && asset.validationStatus === "valid") || hasReadyMockup(relic.id)
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
    printfulWebhookSecretConfigured: !productionGuardsEnabled || Boolean(process.env.PRINTFUL_WEBHOOK_SECRET),
    fulfillmentSpecsPersisted: relics.every((relic) =>
      Boolean(relic.fulfillmentSpecJson?.catalogVariantId && relic.fulfillmentSpecJson?.printFileUrl && relic.fulfillmentSpecJson?.printFileSha256)
    ),
    productValidationPassed: validation.blocking_errors.length === 0,
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
      ) || hasReadyMockup(relic.id)
    ),
    noMockAssets: !bundle.assets.some((asset) => asset.validationStatus === "mock" || asset.validationStatus === "pending" || asset.url.includes("/api/mockups/")),
    noMockCopy: true,
    printfulManualModeVisible: process.env.PRINTFUL_CONFIRM_ORDERS !== "true"
  };
  const blockers = Object.entries(checklist)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return { ready: blockers.length === 0, blockers, checklist, validation };
}

export function isPublicStorefrontReady(bundle: StorefrontBundle): boolean {
  if (bundle.storefront.status !== "published" || !bundle.activeCollection) return false;
  return reviewReadiness(bundle).ready;
}

export function isGeneratedStorefrontVisible(bundle: StorefrontBundle): boolean {
  if (bundle.storefront.status === "archived" || bundle.drop?.status === "archived") return false;
  return Boolean(bundle.activeCollection || bundle.relics.length);
}

export async function beginStripeEventProcessing(input: {
  id: string;
  type: string;
  livemode: boolean;
  created?: number | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<{ shouldProcess: boolean; event: StripeEventRecord | null }> {
  const now = nowIso();
  const event: StripeEventRecord = {
    id: input.id,
    type: input.type,
    livemode: input.livemode,
    stripeCreatedAt: input.created ? new Date(input.created * 1000).toISOString() : null,
    status: "processing",
    error: null,
    metadataJson: input.metadataJson || null,
    processedAt: null,
    createdAt: now,
    updatedAt: now
  };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.stripeEvents.find((entry) => entry.id === input.id);
      if (existing) {
        if (existing.status === "failed") {
          existing.status = "processing";
          existing.error = null;
          existing.metadataJson = { ...(existing.metadataJson || {}), ...(input.metadataJson || {}), retryStartedAt: nowIso() };
          existing.updatedAt = nowIso();
          return { shouldProcess: true, event: existing };
        }
        return { shouldProcess: false, event: existing };
      }
      data.stripeEvents.push(event);
      return { shouldProcess: true, event };
    });
  }
  const [inserted] = await sql()`
    insert into stripe_events ${sql()(toSnake(event))}
    on conflict (id) do nothing
    returning *
  `;
  if (inserted) return { shouldProcess: true, event: row<StripeEventRecord>(toCamel(inserted)) };
  const [existing] = await sql()`select * from stripe_events where id = ${input.id} limit 1`;
  if (existing?.status === "failed") {
    const [retry] = await sql()`
      update stripe_events
      set status = 'processing',
          error = null,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${sql().json(({ ...(input.metadataJson || {}), retryStartedAt: nowIso() }) as any)}::jsonb,
          updated_at = now()
      where id = ${input.id} and status = 'failed'
      returning *
    `;
    if (retry) return { shouldProcess: true, event: row<StripeEventRecord>(toCamel(retry)) };
  }
  return { shouldProcess: false, event: existing ? row<StripeEventRecord>(toCamel(existing)) : null };
}

export async function markStripeEventProcessed(id: string, metadataJson?: Record<string, unknown> | null): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const event = data.stripeEvents.find((entry) => entry.id === id);
      if (!event) return;
      event.status = "processed";
      event.processedAt = nowIso();
      event.updatedAt = nowIso();
      event.metadataJson = { ...(event.metadataJson || {}), ...(metadataJson || {}) };
    });
    return;
  }
  await sql()`
    update stripe_events
    set status = 'processed', processed_at = now(), updated_at = now(), metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${sql().json((metadataJson || {}) as any)}::jsonb
    where id = ${id}
  `;
}

export async function markStripeEventFailed(id: string, error: string, metadataJson?: Record<string, unknown> | null): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const event = data.stripeEvents.find((entry) => entry.id === id);
      if (!event) return;
      event.status = "failed";
      event.error = error;
      event.updatedAt = nowIso();
      event.metadataJson = { ...(event.metadataJson || {}), ...(metadataJson || {}) };
    });
    return;
  }
  await sql()`
    update stripe_events
    set status = 'failed', error = ${error}, updated_at = now(), metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${sql().json((metadataJson || {}) as any)}::jsonb
    where id = ${id}
  `;
}

export async function getStripeEventRecord(id: string): Promise<StripeEventRecord | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.stripeEvents.find((entry) => entry.id === id) || null;
  }
  const [event] = await sql()`select * from stripe_events where id = ${id} limit 1`;
  return event ? row<StripeEventRecord>(toCamel(event)) : null;
}

export async function createScoutCheckoutSessionRecord(input: {
  stripeSessionId: string;
  submittedUrl: string;
  canonicalUrl: string;
  canonicalRootDomain: string;
  rootDomainHash: string;
  slug: string;
  scoutUserId?: string | null;
  scoutUsername?: string | null;
  summonerWallet?: string | null;
  creatorDisplayName?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  metadataJson?: Record<string, unknown> | null;
  expiresAt?: string | null;
}): Promise<ScoutCheckoutSession> {
  const now = nowIso();
  const record: ScoutCheckoutSession = {
    id: newId("scout_chk"),
    stripeSessionId: input.stripeSessionId,
    submittedUrl: input.submittedUrl,
    canonicalUrl: input.canonicalUrl,
    canonicalRootDomain: input.canonicalRootDomain,
    rootDomainHash: input.rootDomainHash,
    slug: input.slug,
    scoutUserId: input.scoutUserId || null,
    scoutUsername: input.scoutUsername || null,
    summonerWallet: input.summonerWallet || null,
    creatorDisplayName: input.creatorDisplayName || null,
    amountTotal: input.amountTotal ?? null,
    currency: input.currency || null,
    status: "created",
    generationJobId: null,
    dropId: null,
    error: null,
    metadataJson: input.metadataJson || null,
    completedAt: null,
    expiresAt: input.expiresAt || null,
    createdAt: now,
    updatedAt: now
  };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.scoutCheckoutSessions.find((entry) => entry.stripeSessionId === input.stripeSessionId);
      if (existing) return existing;
      data.scoutCheckoutSessions.push(record);
      return record;
    });
  }
  const [inserted] = await sql()`
    insert into scout_checkout_sessions ${sql()(toSnake(record))}
    on conflict (stripe_session_id) do update set updated_at = scout_checkout_sessions.updated_at
    returning *
  `;
  return row<ScoutCheckoutSession>(toCamel(inserted));
}

export async function getActiveScoutCheckoutByRootDomainHash(rootDomainHash: string, now = new Date()): Promise<ScoutCheckoutSession | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return (
      data.scoutCheckoutSessions
        .filter((entry) => entry.rootDomainHash === rootDomainHash && entry.status === "created")
        .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt).getTime() > now.getTime())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null
    );
  }
  const [record] = await sql()`
    select *
    from scout_checkout_sessions
    where root_domain_hash = ${rootDomainHash}
      and status = 'created'
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
  `;
  return record ? row<ScoutCheckoutSession>(toCamel(record)) : null;
}

export async function getScoutCheckoutSessionByStripeSessionId(stripeSessionId: string): Promise<ScoutCheckoutSession | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.scoutCheckoutSessions.find((entry) => entry.stripeSessionId === stripeSessionId) || null;
  }
  const [record] = await sql()`select * from scout_checkout_sessions where stripe_session_id = ${stripeSessionId} limit 1`;
  return record ? row<ScoutCheckoutSession>(toCamel(record)) : null;
}

export async function withScoutRootDomainLock<T>(rootDomainHash: string, callback: () => Promise<T>): Promise<T> {
  if (!usePostgres()) return callback();
  return (await sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${rootDomainHash}))`;
    return callback();
  })) as T;
}

export async function updateScoutCheckoutSessionRecord(
  stripeSessionId: string,
  patch: Partial<Pick<ScoutCheckoutSession, "status" | "generationJobId" | "dropId" | "error" | "metadataJson" | "amountTotal" | "currency">>
): Promise<ScoutCheckoutSession | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const record = data.scoutCheckoutSessions.find((entry) => entry.stripeSessionId === stripeSessionId);
      if (!record) return null;
      Object.assign(record, patch, { updatedAt: nowIso() });
      if (patch.status === "completed") record.completedAt = record.completedAt || nowIso();
      return record;
    });
  }
  const [updated] = await sql()`
    update scout_checkout_sessions
    set status = coalesce(${patch.status || null}, status),
        generation_job_id = coalesce(${patch.generationJobId || null}, generation_job_id),
        drop_id = coalesce(${patch.dropId || null}, drop_id),
        error = coalesce(${patch.error || null}, error),
        amount_total = coalesce(${patch.amountTotal ?? null}, amount_total),
        currency = coalesce(${patch.currency || null}, currency),
        metadata_json = case when ${patch.metadataJson ? JSON.stringify(patch.metadataJson) : null}::jsonb is null then metadata_json else ${patch.metadataJson ? JSON.stringify(patch.metadataJson) : null}::jsonb end,
        completed_at = case when ${patch.status === "completed"} then coalesce(completed_at, now()) else completed_at end,
        updated_at = now()
    where stripe_session_id = ${stripeSessionId}
    returning *
  `;
  return updated ? row<ScoutCheckoutSession>(toCamel(updated)) : null;
}

export async function reserveEditionForRelic(input: {
  relicId: string;
  editionId?: string | null;
  editionNumber?: number | null;
  requestId?: string | null;
  traceId?: string | null;
  ttlMs?: number;
}): Promise<{ checkout: CheckoutSession; edition: RelicEdition; bundle: StorefrontBundle }> {
  const globalPause = await checkoutPauseState();
  if (globalPause.paused) throw new Error(`Checkout is paused${globalPause.reason ? `: ${globalPause.reason}` : "."}`);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 30 * 60 * 1000)).toISOString();
  const checkoutId = newId("chk");
  if (!usePostgres()) {
    return mutateStore((data) => {
      releaseExpiredInMemory(data);
      const relic = data.relics.find((entry) => entry.id === input.relicId);
      if (!relic) throw new Error("Relic not found.");
      const collection = data.collections.find((entry) => entry.id === relic.collectionId);
      const storefront = collection ? data.storefronts.find((entry) => entry.id === collection.storefrontId) : null;
      const drop = storefront ? data.drops.find((entry) => entry.storefrontId === storefront.id) : null;
      if (
        !collection ||
        !storefront ||
        !drop ||
        drop.status !== "published" ||
        drop.domainClaimStatus !== "verified" ||
        drop.publishStatus !== "published" ||
        storefront.status !== "published" ||
        storefront.commerceMode !== "platform_checkout" ||
        collection.status !== "published" ||
        relic.status !== "live"
      ) {
        throw new Error("Relic is not available for checkout.");
      }
      if (drop.checkoutPaused) throw new Error(drop.checkoutPauseReason || "Checkout is paused for this DropLink.");
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
    if (
      !drop ||
      drop.status !== "published" ||
      drop.domain_claim_status !== "verified" ||
      drop.publish_status !== "published" ||
      storefront.status !== "published" ||
      storefront.commerce_mode !== "platform_checkout" ||
      collection.status !== "published" ||
      relic.status !== "live"
    ) {
      throw new Error("Relic is not available for checkout.");
    }
    if (drop.checkout_paused) throw new Error(String(drop.checkout_pause_reason || "Checkout is paused for this DropLink."));
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

export async function expireStaleCheckoutReservations(now = new Date()): Promise<{ expired: number }> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      let expired = 0;
      const cutoff = now.getTime();
      for (const checkout of data.checkoutSessions) {
        if (checkout.status !== "created" || new Date(checkout.expiresAt).getTime() >= cutoff) continue;
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
          expired += 1;
        }
      }
      return { expired };
    });
  }
  const rows = await sql().begin(async (tx) => {
    const stale = await tx`select * from checkout_sessions where status = 'created' and expires_at < ${now.toISOString()} for update`;
    for (const checkout of stale) {
      await tx`update checkout_sessions set status = 'expired', updated_at = now() where id = ${checkout.id}`;
      await tx`
        update relic_editions
        set status = 'available', checkout_session_id = null, reserved_at = null, reserved_until = null, updated_at = now()
        where id = ${checkout.relic_edition_id} and status = 'reserved'
      `;
      await tx`update relics set reserved_count = greatest(0, reserved_count - 1), updated_at = now() where id = ${checkout.relic_id}`;
    }
    return stale;
  });
  return { expired: rows.length };
}

export async function verifyCheckoutSessionMatchesReservation(input: {
  stripeSessionId: string;
  amountTotal?: number | null;
  currency?: string | null;
  metadataCheckoutId?: string | null;
}): Promise<true> {
  const checkout = await getCheckoutByStripeSession(input.stripeSessionId);
  if (!checkout) throw new Error("Checkout session not found.");
  if (input.metadataCheckoutId && input.metadataCheckoutId !== checkout.id) throw new Error("Stripe checkout metadata does not match reservation.");
  const bundle = await getStorefrontBundleById(checkout.storefrontId);
  const relic = bundle?.relics.find((entry) => entry.id === checkout.relicId);
  if (!bundle?.drop || !relic) throw new Error("Checkout reservation is missing drop or relic context.");
  const expectedAmount = priceBookRelicPriceCents(bundle.drop.priceBookJson, relic.id);
  if (!expectedAmount) throw new Error("Locked price is missing for checkout reservation.");
  if (typeof input.amountTotal === "number" && input.amountTotal !== expectedAmount) {
    throw new Error(`Stripe checkout amount mismatch: expected ${expectedAmount}, received ${input.amountTotal}.`);
  }
  if (input.currency && input.currency.toLowerCase() !== relic.currency.toLowerCase()) {
    throw new Error(`Stripe checkout currency mismatch: expected ${relic.currency}, received ${input.currency}.`);
  }
  return true;
}

export function ledgerForSale(input: {
  orderId: string;
  amountCents: number;
  currency: string;
  creatorBountyCents: number;
  domainOwnerCents: number;
  protocolFeeCents: number;
  stripeFeeCents?: number;
  printfulCostCents?: number;
  printfulShippingCents?: number;
}): LedgerEntry[] {
  const printfulCost = input.printfulCostCents || 0;
  const printfulShipping = input.printfulShippingCents || 0;
  const createdAt = nowIso();
  return [
    { id: newId("led"), orderId: input.orderId, type: "customer_payment", amountCents: input.amountCents, currency: input.currency, createdAt },
    {
      id: newId("led"),
      orderId: input.orderId,
      type: "stripe_fee",
      amountCents: -Math.abs(input.stripeFeeCents || 0),
      currency: input.currency,
      metadataJson: { estimate: true },
      createdAt
    },
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
  stripeChargeId?: string | null;
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
      const split = revenueSplitForDrop(drop);
      const waterfall = calculateWaterfall({
        grossAmount: locked.grossAmount,
        currency: relic.currency,
        stripeFeeAmount: locked.stripeFeeAmount,
        printfulCostAmount: locked.printfulCostAmount,
        refundReserveAmount: locked.refundReserveAmount,
        creatorBountyBps: split.scoutBps,
        protocolFeeBps: drop.protocolFeeBps
      });
      const order: Order = {
        id: newId("ord"),
        checkoutSessionId: checkout.id,
        dropId: drop.id,
        stripeSessionId: input.stripeSessionId,
        stripePaymentIntentId: input.stripePaymentIntentId || null,
        stripeChargeId: input.stripeChargeId || null,
        stripeRefundId: null,
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
        payoutBlockedAt: null,
        payoutBlockReason: null,
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
        stripeFeeCents: locked.stripeFeeAmount,
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
                reason: split.ownerReceivesAll ? "self-claimed drop; no scout bounty" : "scout bounty from net drop margin",
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
    const split = revenueSplitForDrop(typedDrop);
    const waterfall = calculateWaterfall({
      grossAmount: locked.grossAmount,
      currency: String(relic.currency),
      stripeFeeAmount: locked.stripeFeeAmount,
      printfulCostAmount: locked.printfulCostAmount,
      refundReserveAmount: locked.refundReserveAmount,
      creatorBountyBps: split.scoutBps,
      protocolFeeBps: Number(drop.protocol_fee_bps)
    });
    const order: Order = {
      id: newId("ord"),
      checkoutSessionId: String(checkout.id),
      dropId: String(drop.id),
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId || null,
      stripeChargeId: input.stripeChargeId || null,
      stripeRefundId: null,
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
      payoutBlockedAt: null,
      payoutBlockReason: null,
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
      stripeFeeCents: locked.stripeFeeAmount,
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
          reason: split.ownerReceivesAll ? "self-claimed drop; no scout bounty" : "scout bounty from net drop margin",
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

export async function markOrderPaymentFailed(input: { stripeSessionId: string; reason?: string | null }): Promise<CheckoutSession> {
  let checkout = await getCheckoutByStripeSession(input.stripeSessionId);
  if (!checkout) {
    if (!usePostgres()) {
      const data = await readStore();
      checkout = data.checkoutSessions.find((entry) => entry.id === input.stripeSessionId) || null;
    } else {
      const [rowValue] = await sql()`select * from checkout_sessions where id = ${input.stripeSessionId} limit 1`;
      checkout = rowValue ? row<CheckoutSession>(toCamel(rowValue)) : null;
    }
  }
  if (!checkout) throw new Error("Checkout session not found.");
  await releaseCheckout(checkout.id);
  const updated = (await getCheckoutByStripeSession(input.stripeSessionId)) || checkout;
  await recordEvent({
    entityType: "checkout_session",
    entityId: checkout.id,
    eventType: "checkout_payment_failed",
    level: "warn",
    message: input.reason || "Stripe checkout payment failed.",
    metadataJson: { stripeSessionId: input.stripeSessionId },
    requestId: null,
    traceId: null
  });
  return updated || { ...checkout, status: "expired", updatedAt: nowIso() };
}

export async function markOrderRefundedOrDisputed(input: {
  stripePaymentIntentId?: string | null;
  orderId?: string | null;
  status: "refunded" | "disputed";
  reason?: string | null;
  stripeRefundId?: string | null;
}): Promise<{ order: Order; accruals: LedgerAccrual[] } | null> {
  if (!input.stripePaymentIntentId && !input.orderId) throw new Error("orderId or stripePaymentIntentId is required.");
  if (!usePostgres()) {
    return mutateStore((data) => {
      const order = data.orders.find((entry) =>
        input.orderId ? entry.id === input.orderId : entry.stripePaymentIntentId === input.stripePaymentIntentId
      );
      if (!order) return null;
      order.status = input.status;
      order.stripeRefundId = input.stripeRefundId || order.stripeRefundId || null;
      order.adminReviewRequired = true;
      order.economicsStatus = input.status === "disputed" ? "disputed" : "adjusted";
      order.settlementStatus = input.status;
      order.payoutBlockedAt = order.payoutBlockedAt || nowIso();
      order.payoutBlockReason = `${input.status}: ${input.reason || "stripe event"}`;
      order.updatedAt = nowIso();
      const edition = data.relicEditions.find((entry) => entry.id === order.relicEditionId);
      if (edition && input.status === "refunded") {
        edition.status = "refunded";
        edition.updatedAt = nowIso();
      }
      const accruals = data.ledgerAccruals.filter((entry) => entry.orderId === order.id);
      for (const accrual of accruals) {
        if (accrual.status !== "paid") {
          accrual.status = "reversed";
          accrual.reason = `${accrual.reason}; ${input.status}: ${input.reason || "stripe event"}`;
          accrual.updatedAt = nowIso();
        }
      }
      data.ledgerEntries.push({
        id: newId("led"),
        orderId: order.id,
        type: input.status === "refunded" ? "refund" : "adjustment",
        amountCents: -Math.abs(order.grossAmount || 0),
        currency: order.currency || "usd",
        metadataJson: { status: input.status, reason: input.reason || null },
        createdAt: nowIso()
      });
      return { order, accruals };
    });
  }
  const rows = await sql().begin(async (tx) => {
    const paymentIntentId = input.stripePaymentIntentId || "";
    const [order] = input.orderId
      ? await tx`select * from orders where id = ${input.orderId} for update`
      : await tx`select * from orders where stripe_payment_intent_id = ${paymentIntentId} for update`;
    if (!order) return null;
    await tx`
      update orders
      set status = ${input.status},
          stripe_refund_id = coalesce(${input.stripeRefundId || null}, stripe_refund_id),
          admin_review_required = true,
          economics_status = ${input.status === "disputed" ? "disputed" : "adjusted"},
          settlement_status = ${input.status},
          payout_blocked_at = coalesce(payout_blocked_at, now()),
          payout_block_reason = ${`${input.status}: ${input.reason || "stripe event"}`},
          updated_at = now()
      where id = ${order.id}
    `;
    if (input.status === "refunded") {
      await tx`update relic_editions set status = 'refunded', updated_at = now() where id = ${order.relic_edition_id}`;
    }
    await tx`
      update ledger_accruals
      set status = 'reversed', reason = reason || ${`; ${input.status}: ${input.reason || "stripe event"}`}, updated_at = now()
      where order_id = ${order.id} and status <> 'paid'
    `;
    await tx`insert into ledger_entries ${tx(toSnake({
      id: newId("led"),
      orderId: String(order.id),
      type: input.status === "refunded" ? "refund" : "adjustment",
      amountCents: -Math.abs(Number(order.gross_amount || 0)),
      currency: String(order.currency || "usd"),
      metadataJson: { status: input.status, reason: input.reason || null },
      createdAt: nowIso()
    }))}`;
    const [updatedOrder] = await tx`select * from orders where id = ${order.id}`;
    const accrualRows = await tx`select * from ledger_accruals where order_id = ${order.id}`;
    return { order: row<Order>(toCamel(updatedOrder)), accruals: accrualRows.map((entry) => row<LedgerAccrual>(toCamel(entry))) };
  });
  return rows;
}

export async function reconcileOrderStripePayment(input: {
  orderId: string;
  stripeChargeId?: string | null;
  stripeFeeAmount?: number | null;
  currency?: string | null;
  balanceTransactionId?: string | null;
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const order = data.orders.find((entry) => entry.id === input.orderId);
      if (!order) return;
      order.stripeChargeId = input.stripeChargeId || order.stripeChargeId || null;
      if (typeof input.stripeFeeAmount === "number") {
        order.stripeFeeAmount = input.stripeFeeAmount;
        order.economicsStatus = order.printfulCostsJson ? "settled" : "estimated";
        const existing = data.ledgerEntries.find((entry) => entry.orderId === order.id && entry.type === "stripe_fee");
        if (existing) {
          existing.amountCents = -Math.abs(input.stripeFeeAmount);
          existing.metadataJson = { ...(existing.metadataJson || {}), estimate: false, balanceTransactionId: input.balanceTransactionId || null };
        } else {
          data.ledgerEntries.push({
            id: newId("led"),
            orderId: order.id,
            type: "stripe_fee",
            amountCents: -Math.abs(input.stripeFeeAmount),
            currency: input.currency || order.currency || "usd",
            metadataJson: { estimate: false, balanceTransactionId: input.balanceTransactionId || null },
            createdAt: nowIso()
          });
        }
      }
      order.updatedAt = nowIso();
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`
      update orders
      set stripe_charge_id = coalesce(${input.stripeChargeId || null}, stripe_charge_id),
          stripe_fee_amount = coalesce(${input.stripeFeeAmount ?? null}, stripe_fee_amount),
          economics_status = case when ${typeof input.stripeFeeAmount === "number"} then 'settled' else economics_status end,
          updated_at = now()
      where id = ${input.orderId}
    `;
    if (typeof input.stripeFeeAmount === "number") {
      const [existing] = await tx`select * from ledger_entries where order_id = ${input.orderId} and type = 'stripe_fee' limit 1`;
      if (existing) {
        await tx`
          update ledger_entries
          set amount_cents = ${-Math.abs(input.stripeFeeAmount)},
              metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify({ estimate: false, balanceTransactionId: input.balanceTransactionId || null })}::jsonb
          where id = ${existing.id}
        `;
      } else {
        await tx`insert into ledger_entries ${tx(toSnake({
          id: newId("led"),
          orderId: input.orderId,
          type: "stripe_fee",
          amountCents: -Math.abs(input.stripeFeeAmount),
          currency: input.currency || "usd",
          metadataJson: { estimate: false, balanceTransactionId: input.balanceTransactionId || null },
          createdAt: nowIso()
        }))}`;
      }
    }
  });
}

export async function sendOrderReceiptEmail(orderId: string) {
  const bundle = await listStorefrontBundles().then((bundles) => bundles.find((entry) => entry.orders.some((order) => order.id === orderId)) || null);
  const order = bundle?.orders.find((entry) => entry.id === orderId) || null;
  if (!bundle?.drop || !order) throw new Error("Order not found.");
  if (!order.customerEmail) return { sent: false, provider: "ses" as const, from: emailFromAddressSafe(), reason: "Order has no customer email." };
  const relic = bundle.relics.find((entry) => entry.id === order.relicId);
  const domain = bundle.drop.canonicalRootDomain || bundle.drop.canonicalDomain || bundle.brand.hostname;
  const url = `${appBaseUrl()}/${bundle.storefront.slug}`;
  const subject = "Your DropLink order is confirmed";
  const productName = relic?.name || "your DropLink item";
  const text = `Thanks for your order. We received your purchase for ${productName}.\n\nOrder ID: ${order.id}\nDropLink: ${url}\n\nWe will send another update when fulfillment status changes.`;
  const html = `<p>Thanks for your order. We received your purchase for <strong>${escapeHtml(productName)}</strong>.</p><p>Order ID: ${escapeHtml(order.id)}<br/>DropLink: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>We will send another update when fulfillment status changes.</p>`;
  const result = await sendEmail({ to: order.customerEmail, subject, html, text });
  await recordEvent({
    entityType: "order",
    entityId: order.id,
    eventType: result.sent ? "order_receipt_email_sent" : "order_receipt_email_skipped",
    level: result.sent ? "info" : "warn",
    message: result.sent ? "Order receipt email sent." : result.reason || "Order receipt email skipped.",
    metadataJson: { provider: result.provider, from: result.from, emailHash: emailHash(order.customerEmail) },
    requestId: null,
    traceId: bundle.storefront.generationTraceId || null
  });
  return result;
}

function emailFromAddressSafe() {
  return process.env.DROPLINK_FROM_EMAIL || "DropLink <support@droplink.lat>";
}

export async function createFulfillmentOrder(input: Omit<FulfillmentOrder, "id" | "createdAt" | "updatedAt">): Promise<FulfillmentOrder> {
  const order: FulfillmentOrder = { id: newId("ful"), createdAt: nowIso(), updatedAt: nowIso(), ...input };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.fulfillmentOrders.find((entry) => entry.orderId === input.orderId && entry.provider === input.provider);
      if (existing) {
        existing.providerOrderId = input.providerOrderId || existing.providerOrderId || null;
        existing.providerExternalId = input.providerExternalId || existing.providerExternalId || null;
        existing.status = input.status || existing.status;
        existing.requestJson = input.requestJson || existing.requestJson || null;
        existing.responseJson = input.responseJson || existing.responseJson || null;
        existing.dashboardUrl = input.dashboardUrl || existing.dashboardUrl || null;
        existing.trackingUrl = input.trackingUrl || existing.trackingUrl || null;
        existing.costsJson = input.costsJson || existing.costsJson || null;
        existing.webhookEventsJson = input.webhookEventsJson || existing.webhookEventsJson || null;
        existing.updatedAt = nowIso();
        return existing;
      }
      data.fulfillmentOrders.push(order);
      return order;
    });
  }
  const [existing] = await sql()`select * from fulfillment_orders where order_id = ${input.orderId} and provider = ${input.provider} limit 1`;
  if (existing) {
    const [updated] = await sql()`
      update fulfillment_orders
      set provider_order_id = coalesce(${input.providerOrderId || null}, provider_order_id),
          provider_external_id = coalesce(${input.providerExternalId || null}, provider_external_id),
          status = coalesce(${input.status || null}, status),
          request_json = coalesce(${input.requestJson ? JSON.stringify(input.requestJson) : null}::jsonb, request_json),
          response_json = coalesce(${input.responseJson ? JSON.stringify(input.responseJson) : null}::jsonb, response_json),
          dashboard_url = coalesce(${input.dashboardUrl || null}, dashboard_url),
          tracking_url = coalesce(${input.trackingUrl || null}, tracking_url),
          costs_json = coalesce(${input.costsJson ? JSON.stringify(input.costsJson) : null}::jsonb, costs_json),
          webhook_events_json = coalesce(${input.webhookEventsJson ? JSON.stringify(input.webhookEventsJson) : null}::jsonb, webhook_events_json),
          updated_at = now()
      where id = ${existing.id}
      returning *
    `;
    return row<FulfillmentOrder>(toCamel(updated));
  }
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

export async function getFulfillmentOrderByExternalId(providerExternalId: string): Promise<FulfillmentOrder | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.fulfillmentOrders.find((entry) => entry.provider === "printful" && entry.providerExternalId === providerExternalId) || null;
  }
  const [existing] = await sql()`
    select * from fulfillment_orders
    where provider = 'printful' and provider_external_id = ${providerExternalId}
    limit 1
  `;
  return existing ? row<FulfillmentOrder>(toCamel(existing)) : null;
}

export async function getOrderBundle(orderId: string): Promise<{
  order: Order;
  bundle: StorefrontBundle;
  ledgerEntries: LedgerEntry[];
  ledgerAccruals: LedgerAccrual[];
  fulfillmentOrder: FulfillmentOrder | null;
  stripeTransfers: StripeTransfer[];
  systemEvents: SystemEvent[];
} | null> {
  if (!usePostgres()) {
    const data = await readStore();
    const order = data.orders.find((entry) => entry.id === orderId);
    if (!order) return null;
    const storefront = data.storefronts.find((entry) => entry.id === order.storefrontId);
    const bundle = storefront ? hydrateBundle(data, storefront) : null;
    if (!bundle) return null;
    return {
      order,
      bundle,
      ledgerEntries: data.ledgerEntries.filter((entry) => entry.orderId === orderId),
      ledgerAccruals: data.ledgerAccruals.filter((entry) => entry.orderId === orderId),
      fulfillmentOrder: data.fulfillmentOrders.find((entry) => entry.orderId === orderId && entry.provider === "printful") || null,
      stripeTransfers: data.stripeTransfers.filter((entry) => entry.orderId === orderId),
      systemEvents: data.systemEvents.filter((entry) => entry.entityType === "order" && entry.entityId === orderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }
  const [orderRow] = await sql()`select * from orders where id = ${orderId} limit 1`;
  if (!orderRow) return null;
  const order = row<Order>(toCamel(orderRow));
  const bundle = await getStorefrontBundleById(order.storefrontId);
  if (!bundle) return null;
  const ledgerRows = await sql()`select * from ledger_entries where order_id = ${orderId} order by created_at asc`;
  const accrualRows = await sql()`select * from ledger_accruals where order_id = ${orderId} order by created_at asc`;
  const [fulfillmentRow] = await sql()`select * from fulfillment_orders where order_id = ${orderId} and provider = 'printful' limit 1`;
  const transferRows = await sql()`select * from stripe_transfers where order_id = ${orderId} order by created_at asc`;
  const eventRows = await sql()`select * from system_events where entity_type = 'order' and entity_id = ${orderId} order by created_at desc`;
  return {
    order,
    bundle,
    ledgerEntries: ledgerRows.map((entry) => row<LedgerEntry>(toCamel(entry))),
    ledgerAccruals: accrualRows.map((entry) => row<LedgerAccrual>(toCamel(entry))),
    fulfillmentOrder: fulfillmentRow ? row<FulfillmentOrder>(toCamel(fulfillmentRow)) : null,
    stripeTransfers: transferRows.map((entry) => row<StripeTransfer>(toCamel(entry))),
    systemEvents: eventRows.map((entry) => row<SystemEvent>(toCamel(entry)))
  };
}

export async function updateOrderFulfillmentFields(input: {
  orderId: string;
  printfulOrderId?: string | null;
  printfulStatus?: string | null;
  printfulDashboardUrl?: string | null;
  printfulTrackingUrl?: string | null;
  printfulCostsJson?: Record<string, unknown> | null;
  adminReviewRequired?: boolean | null;
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
      if (input.adminReviewRequired != null) order.adminReviewRequired = Boolean(input.adminReviewRequired);
      order.updatedAt = nowIso();
    });
    return;
  }
  await sql()`
    update orders
    set printful_order_id = coalesce(${input.printfulOrderId || null}, printful_order_id),
        printful_status = coalesce(${input.printfulStatus || null}, printful_status),
        printful_dashboard_url = coalesce(${input.printfulDashboardUrl || null}, printful_dashboard_url),
        printful_tracking_url = coalesce(${input.printfulTrackingUrl || null}, printful_tracking_url),
        printful_costs_json = coalesce(${input.printfulCostsJson ? JSON.stringify(input.printfulCostsJson) : null}::jsonb, printful_costs_json),
        admin_review_required = case when ${input.adminReviewRequired != null} then ${Boolean(input.adminReviewRequired)} else admin_review_required end,
        updated_at = now()
    where id = ${input.orderId}
  `;
}

export async function markOrderFulfillmentReviewRequired(input: {
  orderId: string;
  printfulStatus: string;
  reason: string;
  printfulOrderId?: string | null;
}): Promise<void> {
  await updateOrderFulfillmentFields({
    orderId: input.orderId,
    printfulOrderId: input.printfulOrderId || null,
    printfulStatus: input.printfulStatus,
    adminReviewRequired: true
  });
  await recordEvent({
    entityType: "order",
    entityId: input.orderId,
    eventType: "fulfillment_admin_review_required",
    level: "error",
    message: input.reason,
    metadataJson: {
      printfulStatus: input.printfulStatus,
      printfulOrderId: input.printfulOrderId || null
    },
    requestId: null,
    traceId: null
  });
}

export async function updateFulfillmentOrderStatus(input: {
  orderId: string;
  status: FulfillmentOrder["status"];
  responseJson?: Record<string, unknown> | null;
  trackingUrl?: string | null;
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const fulfillment = data.fulfillmentOrders.find((entry) => entry.orderId === input.orderId && entry.provider === "printful");
      if (fulfillment) {
        fulfillment.status = input.status;
        fulfillment.responseJson = input.responseJson || fulfillment.responseJson || null;
        fulfillment.trackingUrl = input.trackingUrl || fulfillment.trackingUrl || null;
        fulfillment.updatedAt = nowIso();
      }
      const order = data.orders.find((entry) => entry.id === input.orderId);
      if (order) {
        order.printfulStatus = input.status;
        order.printfulTrackingUrl = input.trackingUrl || order.printfulTrackingUrl || null;
        order.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`
      update fulfillment_orders
      set status = ${input.status},
          response_json = case when ${input.responseJson ? JSON.stringify(input.responseJson) : null}::jsonb is null then response_json else response_json || ${input.responseJson ? JSON.stringify(input.responseJson) : null}::jsonb end,
          tracking_url = coalesce(${input.trackingUrl || null}, tracking_url),
          updated_at = now()
      where order_id = ${input.orderId} and provider = 'printful'
    `;
    await tx`
      update orders
      set printful_status = ${input.status},
          printful_tracking_url = coalesce(${input.trackingUrl || null}, printful_tracking_url),
          updated_at = now()
      where id = ${input.orderId}
    `;
  });
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
  lifestylePrompt?: string | null;
  lifestyleMetadataJson?: Record<string, unknown> | null;
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
      if (input.lifestylePrompt) {
        const lifestyleAsset = data.assets.find((entry) => entry.relicId === input.relicId && entry.type === "lifestyle");
        if (lifestyleAsset) {
          lifestyleAsset.prompt = input.lifestylePrompt;
          lifestyleAsset.metadataJson = { ...(lifestyleAsset.metadataJson || {}), ...(input.lifestyleMetadataJson || {}) };
        }
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
    if (input.lifestylePrompt) {
      await tx`
        update assets
        set prompt = ${input.lifestylePrompt},
            metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify(input.lifestyleMetadataJson || {})}::jsonb
        where relic_id = ${input.relicId}
          and type = 'lifestyle'
      `;
    }
  });
  return getDropBundleByDropId(input.dropId);
}

export async function updateManualRelicLifestyleImage(input: {
  dropId: string;
  collectionId: string;
  relicId: string;
  lifestyleAsset: Asset;
}): Promise<StorefrontBundle | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing =
        data.assets.find((entry) => entry.id === input.lifestyleAsset.id) ||
        data.assets.find((entry) => entry.relicId === input.relicId && entry.type === "lifestyle");
      if (existing) Object.assign(existing, input.lifestyleAsset);
      else data.assets.push(input.lifestyleAsset);
      const drop = data.drops.find((entry) => entry.id === input.dropId);
      const storefront = drop ? data.storefronts.find((entry) => entry.id === drop.storefrontId) : null;
      return storefront ? hydrateBundle(data, storefront) : null;
    });
  }

  await sql()`
    insert into assets ${sql()(toSnake(input.lifestyleAsset))}
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

export async function clearManualAsset(input: {
  dropId: string;
  kind: "relic" | "lifestyle" | "og";
  relicId?: string | null;
}): Promise<StorefrontBundle | null> {
  const clearAsset = (asset: Asset) => {
    asset.validationStatus = "pending";
    asset.url = "";
    asset.width = null;
    asset.height = null;
    asset.checksum = null;
    asset.metadataJson = {
      ...(asset.metadataJson || {}),
      manualUploadRequired: true,
      clearedAt: nowIso()
    };
  };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.id === input.dropId);
      const storefront = drop ? data.storefronts.find((entry) => entry.id === drop.storefrontId) : null;
      if (!drop || !storefront) return null;
      const collection = data.collections.find((entry) => entry.storefrontId === storefront.id && (entry.status === "ready_for_review" || entry.status === "published")) ||
        data.collections.find((entry) => entry.storefrontId === storefront.id);
      if (input.kind === "relic" && input.relicId) {
        for (const asset of data.assets.filter((entry) => entry.relicId === input.relicId && (entry.type === "print_file" || entry.type === "preview"))) {
          clearAsset(asset);
        }
        const mockup = data.mockups.find((entry) => entry.relicId === input.relicId);
        if (mockup) {
          mockup.imageUrl = "";
          mockup.status = "manual_pending";
        }
      }
      if (input.kind === "lifestyle" && input.relicId) {
        const asset = data.assets.find((entry) => entry.relicId === input.relicId && entry.type === "lifestyle");
        if (asset) clearAsset(asset);
      }
      if (input.kind === "og" && collection) {
        const asset = data.assets.find((entry) => entry.collectionId === collection.id && entry.type === "og");
        if (asset) clearAsset(asset);
        const og = data.ogImages.find((entry) => entry.collectionId === collection.id);
        if (og) {
          og.imageUrl = "";
          og.status = "manual_pending";
        }
      }
      return hydrateBundle(data, storefront);
    });
  }

  const bundle = await getDropBundleByDropId(input.dropId);
  if (!bundle?.activeCollection) return bundle;
  if (input.kind === "relic" && input.relicId) {
    await sql()`
      update assets
      set validation_status = 'pending',
          url = '',
          width = null,
          height = null,
          checksum = null,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify({ manualUploadRequired: true, clearedAt: nowIso() })}::jsonb
      where relic_id = ${input.relicId}
        and type in ('print_file', 'preview')
    `;
    await sql()`update mockups set image_url = '', status = 'manual_pending' where relic_id = ${input.relicId}`;
  }
  if (input.kind === "lifestyle" && input.relicId) {
    await sql()`
      update assets
      set validation_status = 'pending',
          url = '',
          width = null,
          height = null,
          checksum = null,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify({ manualUploadRequired: true, clearedAt: nowIso() })}::jsonb
      where relic_id = ${input.relicId}
        and type = 'lifestyle'
    `;
  }
  if (input.kind === "og") {
    await sql()`
      update assets
      set validation_status = 'pending',
          url = '',
          width = null,
          height = null,
          checksum = null,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify({ manualUploadRequired: true, clearedAt: nowIso() })}::jsonb
      where collection_id = ${bundle.activeCollection.id}
        and type = 'og'
    `;
    await sql()`update og_images set image_url = '', status = 'manual_pending' where collection_id = ${bundle.activeCollection.id}`;
  }
  return getDropBundleByDropId(input.dropId);
}

export async function updateFulfillmentOrderFromProvider(input: {
  providerOrderId?: string | null;
  providerExternalId?: string | null;
  status?: FulfillmentOrder["status"];
  trackingUrl?: string | null;
  eventJson: Record<string, unknown>;
}): Promise<FulfillmentOrder | null> {
  const incomingEventId =
    typeof input.eventJson.id === "string"
      ? input.eventJson.id
      : typeof input.eventJson.event_id === "string"
        ? input.eventJson.event_id
        : typeof input.eventJson.webhook_event_id === "string"
          ? input.eventJson.webhook_event_id
          : null;
  const appendWebhookEvent = (priorEvents: unknown[]) => {
    if (
      incomingEventId &&
      priorEvents.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const event = entry as Record<string, unknown>;
        return event.id === incomingEventId || event.event_id === incomingEventId || event.webhook_event_id === incomingEventId;
      })
    ) {
      return priorEvents;
    }
    return [...priorEvents, input.eventJson];
  };
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
        events: appendWebhookEvent((((order.webhookEventsJson as { events?: unknown[] } | null)?.events || []) as unknown[]))
      };
      order.updatedAt = nowIso();
      const parent = data.orders.find((entry) => entry.id === order.orderId);
      if (parent) {
        parent.printfulStatus = order.status;
        parent.printfulTrackingUrl = order.trackingUrl || parent.printfulTrackingUrl || null;
        if (order.status === "shipped") parent.status = "shipped";
        if (order.status === "delivered") parent.status = "delivered";
        if (order.status === "failed") parent.adminReviewRequired = true;
        parent.updatedAt = nowIso();
      }
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
  const webhookEventsJson = { events: appendWebhookEvent(priorEvents) };
  const [updated] = await sql()`
    update fulfillment_orders
    set status = ${input.status || existing.status},
        tracking_url = ${input.trackingUrl || existing.tracking_url || null},
        webhook_events_json = ${JSON.stringify(webhookEventsJson)}::jsonb,
        updated_at = now()
    where id = ${existing.id}
    returning *
  `;
  if (updated) {
    await sql()`
      update orders
      set printful_status = ${updated.status},
          printful_tracking_url = coalesce(${input.trackingUrl || null}, printful_tracking_url),
          status = case
            when ${updated.status} = 'shipped' then 'shipped'
            when ${updated.status} = 'delivered' then 'delivered'
            else status
          end,
          admin_review_required = case when ${updated.status} = 'failed' then true else admin_review_required end,
          updated_at = now()
      where id = ${updated.order_id}
    `;
  }
  return updated ? row<FulfillmentOrder>(toCamel(updated)) : null;
}

export type FulfillmentRepairIssue = {
  orderId: string;
  dropId?: string | null;
  storefrontSlug?: string | null;
  orderStatus: string;
  printfulStatus?: string | null;
  fulfillmentStatus?: string | null;
  providerOrderId?: string | null;
  providerExternalId?: string | null;
  adminReviewRequired: boolean;
  issueTypes: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

function fulfillmentIssueTypes(order: Order, fulfillment: FulfillmentOrder | null): string[] {
  const issues: string[] = [];
  if (order.status === "paid" && !fulfillment) issues.push("paid_no_fulfillment_order");
  if (order.adminReviewRequired) issues.push("admin_review_required");
  if (order.printfulStatus === "failed") issues.push("printful_failed");
  if (order.printfulStatus === "reconciliation_required" || fulfillment?.status === "reconciliation_required") issues.push("printful_ambiguous");
  if (order.printfulOrderId && !fulfillment) issues.push("order_has_provider_id_missing_fulfillment_row");
  if (fulfillment && !fulfillment.providerOrderId) issues.push("fulfillment_row_missing_provider_id");
  return issues;
}

export async function listFulfillmentRepairIssues(): Promise<FulfillmentRepairIssue[]> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.orders
      .map((order) => {
        const fulfillment = data.fulfillmentOrders.find((entry) => entry.orderId === order.id && entry.provider === "printful") || null;
        const storefront = data.storefronts.find((entry) => entry.id === order.storefrontId) || null;
        const issueTypes = fulfillmentIssueTypes(order, fulfillment);
        return {
          orderId: order.id,
          dropId: order.dropId || null,
          storefrontSlug: storefront?.slug || null,
          orderStatus: order.status,
          printfulStatus: order.printfulStatus || null,
          fulfillmentStatus: fulfillment?.status || null,
          providerOrderId: fulfillment?.providerOrderId || order.printfulOrderId || null,
          providerExternalId: fulfillment?.providerExternalId || null,
          adminReviewRequired: Boolean(order.adminReviewRequired),
          issueTypes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      })
      .filter((entry) => entry.issueTypes.length > 0);
  }
  const rows = await sql()`
    select
      o.id as order_id,
      o.drop_id,
      s.slug as storefront_slug,
      o.status as order_status,
      o.printful_status,
      o.printful_order_id,
      o.admin_review_required,
      o.created_at,
      o.updated_at,
      f.status as fulfillment_status,
      f.provider_order_id,
      f.provider_external_id
    from orders o
    left join fulfillment_orders f on f.order_id = o.id and f.provider = 'printful'
    left join storefronts s on s.id = o.storefront_id
    where o.status = 'paid'
       or o.admin_review_required is true
       or o.printful_status in ('failed', 'reconciliation_required')
       or (o.printful_order_id is not null and f.id is null)
       or (f.id is not null and f.provider_order_id is null)
    order by o.created_at desc
  `;
  return rows
    .map((entry) => {
      const order = {
        id: String(entry.order_id),
        dropId: entry.drop_id ? String(entry.drop_id) : null,
        storefrontId: "",
        collectionId: "",
        relicId: "",
        relicEditionId: "",
        checkoutSessionId: "",
        status: String(entry.order_status) as Order["status"],
        printfulStatus: entry.printful_status ? String(entry.printful_status) : null,
        printfulOrderId: entry.printful_order_id ? String(entry.printful_order_id) : null,
        adminReviewRequired: Boolean(entry.admin_review_required),
        createdAt: entry.created_at ? new Date(entry.created_at as Date).toISOString() : "",
        updatedAt: entry.updated_at ? new Date(entry.updated_at as Date).toISOString() : ""
      } as Order;
      const fulfillment = entry.fulfillment_status
        ? ({
            orderId: order.id,
            provider: "printful",
            status: String(entry.fulfillment_status) as FulfillmentOrder["status"],
            providerOrderId: entry.provider_order_id ? String(entry.provider_order_id) : null,
            providerExternalId: entry.provider_external_id ? String(entry.provider_external_id) : null
          } as FulfillmentOrder)
        : null;
      return {
        orderId: order.id,
        dropId: order.dropId,
        storefrontSlug: entry.storefront_slug ? String(entry.storefront_slug) : null,
        orderStatus: order.status,
        printfulStatus: order.printfulStatus || null,
        fulfillmentStatus: fulfillment?.status || null,
        providerOrderId: fulfillment?.providerOrderId || order.printfulOrderId || null,
        providerExternalId: fulfillment?.providerExternalId || null,
        adminReviewRequired: Boolean(order.adminReviewRequired),
        issueTypes: fulfillmentIssueTypes(order, fulfillment),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    })
    .filter((entry) => entry.issueTypes.length > 0);
}

export async function blockOrderPayout(input: { orderId: string; reason: string }): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const order = data.orders.find((entry) => entry.id === input.orderId);
      if (order) {
        order.payoutBlockedAt = order.payoutBlockedAt || nowIso();
        order.payoutBlockReason = input.reason;
        order.adminReviewRequired = true;
        order.updatedAt = nowIso();
      }
      for (const accrual of data.ledgerAccruals.filter((entry) => entry.orderId === input.orderId && entry.status !== "paid")) {
        accrual.status = "reversed";
        accrual.reason = `${accrual.reason}; payout blocked: ${input.reason}`;
        accrual.updatedAt = nowIso();
      }
      for (const transfer of data.stripeTransfers.filter((entry) => entry.orderId === input.orderId && entry.status !== "created")) {
        transfer.status = "blocked";
        transfer.error = input.reason;
        transfer.updatedAt = nowIso();
      }
    });
    return;
  }
  await sql().begin(async (tx) => {
    await tx`
      update orders
      set payout_blocked_at = coalesce(payout_blocked_at, now()),
          payout_block_reason = ${input.reason},
          admin_review_required = true,
          updated_at = now()
      where id = ${input.orderId}
    `;
    await tx`
      update ledger_accruals
      set status = 'reversed',
          reason = reason || ${`; payout blocked: ${input.reason}`},
          updated_at = now()
      where order_id = ${input.orderId} and status <> 'paid'
    `;
    await tx`
      update stripe_transfers
      set status = 'blocked', error = ${input.reason}, updated_at = now()
      where order_id = ${input.orderId} and status <> 'created'
    `;
  });
}

export async function getStripeTransferByIdempotencyKey(idempotencyKey: string): Promise<StripeTransfer | null> {
  if (!usePostgres()) {
    const data = await readStore();
    return data.stripeTransfers.find((entry) => entry.idempotencyKey === idempotencyKey) || null;
  }
  const [transfer] = await sql()`select * from stripe_transfers where idempotency_key = ${idempotencyKey} limit 1`;
  return transfer ? row<StripeTransfer>(toCamel(transfer)) : null;
}

export async function createStripeTransferRecord(input: Omit<StripeTransfer, "id" | "createdAt" | "updatedAt" | "status" | "stripeTransferId" | "error"> & {
  status?: StripeTransfer["status"];
  stripeTransferId?: string | null;
  error?: string | null;
}): Promise<StripeTransfer> {
  const transfer: StripeTransfer = {
    id: newId("trn"),
    ...input,
    status: input.status || "pending",
    stripeTransferId: input.stripeTransferId || null,
    error: input.error || null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!usePostgres()) {
    return mutateStore((data) => {
      const existing = data.stripeTransfers.find((entry) => entry.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
      data.stripeTransfers.push(transfer);
      return transfer;
    });
  }
  const [inserted] = await sql()`
    insert into stripe_transfers ${sql()(toSnake(transfer))}
    on conflict (idempotency_key) do update set updated_at = stripe_transfers.updated_at
    returning *
  `;
  return row<StripeTransfer>(toCamel(inserted));
}

export async function markStripeTransferCreated(input: {
  idempotencyKey: string;
  stripeTransferId: string;
  status?: StripeTransfer["status"];
  metadataJson?: Record<string, unknown> | null;
}): Promise<StripeTransfer | null> {
  if (!usePostgres()) {
    return mutateStore((data) => {
      const transfer = data.stripeTransfers.find((entry) => entry.idempotencyKey === input.idempotencyKey);
      if (!transfer) return null;
      transfer.stripeTransferId = input.stripeTransferId;
      transfer.status = input.status || "created";
      transfer.metadataJson = { ...(transfer.metadataJson || {}), ...(input.metadataJson || {}) };
      transfer.updatedAt = nowIso();
      const accrual = transfer.ledgerAccrualId ? data.ledgerAccruals.find((entry) => entry.id === transfer.ledgerAccrualId) : null;
      if (accrual) {
        accrual.status = "paid";
        accrual.txHash = input.stripeTransferId;
        accrual.updatedAt = nowIso();
      }
      return transfer;
    });
  }
  const [updated] = await sql().begin(async (tx) => {
    const [transfer] = await tx`
      update stripe_transfers
      set stripe_transfer_id = ${input.stripeTransferId},
          status = ${input.status || "created"},
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${JSON.stringify(input.metadataJson || {})}::jsonb,
          updated_at = now()
      where idempotency_key = ${input.idempotencyKey}
      returning *
    `;
    if (transfer?.ledger_accrual_id) {
      await tx`
        update ledger_accruals
        set status = 'paid', tx_hash = ${input.stripeTransferId}, updated_at = now()
        where id = ${transfer.ledger_accrual_id}
      `;
    }
    return [transfer];
  });
  return updated ? row<StripeTransfer>(toCamel(updated)) : null;
}

export async function markStripeTransferFailed(input: { idempotencyKey: string; error: string }): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const transfer = data.stripeTransfers.find((entry) => entry.idempotencyKey === input.idempotencyKey);
      if (!transfer) return;
      transfer.status = "failed";
      transfer.error = input.error;
      transfer.updatedAt = nowIso();
    });
    return;
  }
  await sql()`
    update stripe_transfers
    set status = 'failed', error = ${input.error}, updated_at = now()
    where idempotency_key = ${input.idempotencyKey}
  `;
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
        drop.domainOwnerWallet = input.claimantWallet || drop.domainOwnerWallet || null;
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
          domain_owner_wallet = coalesce(${input.claimantWallet || null}, domain_owner_wallet),
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
        drop.domainOwnerWallet = claim.claimantWallet || drop.domainOwnerWallet || null;
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
    const claimantWallet = claim.claimantWallet || null;
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
            domain_owner_wallet = coalesce(${claimantWallet}, domain_owner_wallet),
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
      drop.domainOwnerWallet = drop.domainOwnerWallet || input.walletAddress;
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
          domain_owner_wallet = coalesce(domain_owner_wallet, ${input.walletAddress}),
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
      const existingAccount = data.stripeAccounts.find((entry) => entry.stripeAccountId === accountId);
      if (existingAccount) {
        existingAccount.status = "onboarding";
        existingAccount.updatedAt = nowIso();
      } else {
        data.stripeAccounts.push({
          id: newId("sca"),
          storefrontId: bundle.storefront.id,
          stripeAccountId: accountId,
          status: "onboarding",
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
    });
  } else {
    await sql().begin(async (tx) => {
      await tx`
        update drops
        set stripe_connect_account_id = ${accountId},
            stripe_connect_onboarding_url = ${link.url},
            stripe_connect_status = 'onboarding',
            payout_method = 'stripe_connect',
            payout_status = 'missing',
            updated_at = now()
        where id = ${dropId}
      `;
      await tx`
        insert into stripe_accounts (id, storefront_id, stripe_account_id, status, created_at, updated_at)
        values (${newId("sca")}, ${bundle.storefront.id}, ${accountId}, 'onboarding', now(), now())
        on conflict do nothing
      `;
    });
  }
  return { accountId, onboardingUrl: link.url };
}

export async function updateStripeConnectPayoutStatus(input: {
  accountId: string;
  payoutsEnabled: boolean;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsCurrentlyDue?: unknown[] | Record<string, unknown> | null;
  requirementsEventuallyDue?: unknown[] | Record<string, unknown> | null;
  disabledReason?: string | null;
}): Promise<void> {
  if (!usePostgres()) {
    await mutateStore((data) => {
      const drop = data.drops.find((entry) => entry.stripeConnectAccountId === input.accountId);
      if (!drop) return;
      drop.stripeConnectStatus = input.payoutsEnabled ? "ready" : input.detailsSubmitted ? "submitted" : "pending";
      drop.stripeConnectChargesEnabled = Boolean(input.chargesEnabled);
      drop.stripeConnectPayoutsEnabled = Boolean(input.payoutsEnabled);
      drop.stripeConnectDetailsSubmitted = Boolean(input.detailsSubmitted);
      drop.stripeConnectRequirementsCurrentlyDue = input.requirementsCurrentlyDue || null;
      drop.stripeConnectRequirementsEventuallyDue = input.requirementsEventuallyDue || null;
      drop.stripeConnectDisabledReason = input.disabledReason || null;
      drop.stripeConnectLastAccountUpdatedAt = nowIso();
      if (input.payoutsEnabled) {
        drop.payoutStatus = "stripe_connect_ready";
        drop.payoutMethod = "stripe_connect";
        drop.stripeConnectVerifiedAt = nowIso();
        drop.payoutConfiguredAt = drop.payoutConfiguredAt || nowIso();
      }
      drop.updatedAt = nowIso();
      const account = data.stripeAccounts.find((entry) => entry.stripeAccountId === input.accountId);
      if (account) {
        account.status = drop.stripeConnectStatus || "pending";
        account.updatedAt = nowIso();
      }
    });
    return;
  }
  const status = input.payoutsEnabled ? "ready" : input.detailsSubmitted ? "submitted" : "pending";
  await sql().begin(async (tx) => {
    await tx`
      update drops
      set stripe_connect_status = ${status},
          stripe_connect_charges_enabled = ${Boolean(input.chargesEnabled)},
          stripe_connect_payouts_enabled = ${Boolean(input.payoutsEnabled)},
          stripe_connect_details_submitted = ${Boolean(input.detailsSubmitted)},
          stripe_connect_requirements_currently_due = ${JSON.stringify(input.requirementsCurrentlyDue || [])}::jsonb,
          stripe_connect_requirements_eventually_due = ${JSON.stringify(input.requirementsEventuallyDue || [])}::jsonb,
          stripe_connect_disabled_reason = ${input.disabledReason || null},
          stripe_connect_last_account_updated_at = now(),
          payout_status = case when ${input.payoutsEnabled} then 'stripe_connect_ready' else payout_status end,
          payout_method = case when ${input.payoutsEnabled} then 'stripe_connect' else payout_method end,
          stripe_connect_verified_at = case when ${input.payoutsEnabled} then now() else stripe_connect_verified_at end,
          payout_configured_at = case when ${input.payoutsEnabled} then coalesce(payout_configured_at, now()) else payout_configured_at end,
          updated_at = now()
      where stripe_connect_account_id = ${input.accountId}
    `;
    await tx`update stripe_accounts set status = ${status}, updated_at = now() where stripe_account_id = ${input.accountId}`;
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

export function finiteDropRelicCount() {
  return dropConfig.relicsPerDrop;
}
