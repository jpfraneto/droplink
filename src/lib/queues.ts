import { Queue, QueueEvents, type ConnectionOptions, type JobsOptions } from "bullmq";
import { canonicalizeDropUrl } from "./dropCanonicalization";
import { assertFiniteDropConfig, dropConfig } from "./env";
import { newId } from "./hashes";
import { logger } from "./logger";
import { brandSlugFromUrl, uniqueSlug } from "./slugs";
import { createGenerationJob, existingStorefrontSlugs, recordEvent, saveScoutShell, updateGenerationJobStep } from "./store";
import { domainFromUrl, normalizePublicUrl } from "./urls";
import type { Drop, DropSourceSignal } from "./types";

export type GenerationQueuePayload = {
  jobId: string;
  traceId: string;
  url: string;
  brandId?: string;
  storefrontId?: string;
  collectionId?: string;
  dropId?: string;
  slug?: string;
  dnsClaimNonce?: string;
  summonerWallet?: string | null;
  scoutUserId?: string | null;
  creatorDisplayName?: string | null;
  summonPaymentTxHash?: string | null;
  summonPaymentMetadataJson?: Record<string, unknown> | null;
};

let connection: ConnectionOptions | null = null;
let generationQueueInstance: Queue<GenerationQueuePayload> | null = null;
let generationQueueEventsInstance: QueueEvents | null = null;

export const GENERATION_QUEUE_NAME = "droplink-generation";

export function redisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function redisConnection() {
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("REDIS_URL is required for production queues.");
    throw new Error("REDIS_URL is not configured.");
  }
  if (!connection) {
    const parsed = new URL(process.env.REDIS_URL);
    connection = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: parsed.protocol === "rediss:" ? {} : undefined
    } as ConnectionOptions;
  }
  return connection;
}

export function generationQueue() {
  if (!generationQueueInstance) {
    generationQueueInstance = new Queue<GenerationQueuePayload>(GENERATION_QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: defaultGenerationJobOptions()
    });
  }
  return generationQueueInstance;
}

export function generationQueueEvents() {
  if (!generationQueueEventsInstance) {
    generationQueueEventsInstance = new QueueEvents(GENERATION_QUEUE_NAME, {
      connection: redisConnection()
    });
  }
  return generationQueueEventsInstance;
}

export function defaultGenerationJobOptions(): JobsOptions {
  return {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60, count: 5000 }
  };
}

export async function enqueueGeneration(input: {
  url: string;
  requestId?: string | null;
  summonerWallet?: string | null;
  scoutUserId?: string | null;
  creatorDisplayName?: string | null;
  summonPaymentTxHash?: string | null;
  summonPaymentMetadataJson?: Record<string, unknown> | null;
}) {
  assertFiniteDropConfig();
  const traceId = newId("run");
  const canonicalTarget = canonicalizeDropUrl(input.url);
  await normalizePublicUrl(input.url);
  const canonicalUrl = canonicalTarget.canonicalUrl;
  const sourceUrl = canonicalTarget.sourceUrl;
  const hostname = canonicalTarget.canonicalRootDomain || canonicalTarget.canonicalDomain || domainFromUrl(canonicalUrl);
  const dropId = `drop_${canonicalTarget.rootDomainHash.slice(0, 24)}`;
  const brandId = newId("brand");
  const storefrontId = newId("store");
  const collectionId = newId("col");
  const dnsClaimNonce = newId("dns").replace(/^dns_/, "");
  const slug = uniqueSlug(brandSlugFromUrl(`https://${hostname}`), await existingStorefrontSlugs());
  const job = await createGenerationJob({
    traceId,
    type: "drop",
    inputJson: {
      url: canonicalUrl,
      sourceUrl,
      type: "drop",
      queue: GENERATION_QUEUE_NAME,
      slug,
      storefrontId,
      dropId
    }
  });
  const now = new Date().toISOString();
  const drop: Drop = {
    id: dropId,
    storefrontId,
    originalSubmittedUrl: canonicalTarget.originalSubmittedUrl,
    submittedHost: canonicalTarget.submittedHost,
    submittedPath: canonicalTarget.submittedPath,
    sourceUrl,
    canonicalUrl,
    canonicalDomain: hostname,
    canonicalRootDomain: canonicalTarget.canonicalRootDomain,
    registrableDomain: canonicalTarget.registrableDomain,
    rootDomainHash: canonicalTarget.rootDomainHash,
    domainHash: canonicalTarget.rootDomainHash,
    status: "summoned",
    domainClaimStatus: "unclaimed",
    payoutStatus: "missing",
    payoutMethod: "none",
    publishStatus: "blocked",
    scoutUserId: input.scoutUserId || null,
    summonerWallet: input.summonerWallet || null,
    creatorDisplayName: input.creatorDisplayName || null,
    summonPaymentTxHash: input.summonPaymentTxHash || null,
    summonPaymentMetadataJson: input.summonPaymentMetadataJson || null,
    summonPriceUsdc: dropConfig.summonPriceUsdc,
    creatorBountyBps: dropConfig.creatorBountyBps,
    protocolFeeBps: dropConfig.protocolFeeBps,
    totalSupply: dropConfig.totalSupply,
    relicsPerDrop: dropConfig.relicsPerDrop,
    editionsPerRelic: dropConfig.editionsPerRelic,
    dnsClaimNonce,
    dnsRecordName: `_droplink.${hostname}`,
    dnsRecordValue: `droplink-claim=${dnsClaimNonce}`,
    domainOwnerName: null,
    domainOwnerWallet: null,
    domainOwnerEmail: null,
    domainClaimProofJson: null,
    domainClaimedAt: null,
    tempoWalletAddress: null,
    tempoWalletVerifiedAt: null,
    tempoWalletVerificationProofJson: null,
    payoutNonce: null,
    payoutDnsRecordName: null,
    payoutDnsRecordValue: null,
    stripeConnectAccountId: null,
    stripeConnectStatus: null,
    stripeConnectOnboardingUrl: null,
    stripeConnectVerifiedAt: null,
    payoutConfiguredAt: null,
    priceBookJson: null,
    projectedEconomicsJson: null,
    priceBookLockedAt: null,
    publishedAt: null,
    soldOutAt: null,
    archivedAt: null,
    readinessJson: null,
    createdAt: now,
    updatedAt: now
  };
  const sourceSignal: DropSourceSignal = {
    id: newId("sig"),
    dropId,
    submittedUrl: canonicalTarget.originalSubmittedUrl,
    submittedHost: canonicalTarget.submittedHost,
    submittedPath: canonicalTarget.submittedPath,
    normalizedUrl: sourceUrl,
    submittedByWallet: input.summonerWallet || null,
    submittedAt: now,
    usedForGeneration: true,
    signalMetadataJson: { reason: "initial summon source" }
  };
  await saveScoutShell({
    brand: {
      id: brandId,
      canonicalUrl: `https://${hostname}/`,
      hostname,
      slug,
      name: hostname.replace(/\..*/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      createdAt: now,
      updatedAt: now
    },
    storefront: {
      id: storefrontId,
      brandId,
      slug,
      status: "summoned",
      claimStatus: "unclaimed",
      commerceMode: "preview",
      commissionBps: 0,
      customDomain: null,
      stripeConnectedAccountId: null,
      generationStatus: "INTAKE_CREATED",
      generationTraceId: traceId,
      createdAt: now,
      updatedAt: now,
      publishedAt: null
    },
    drop,
    sourceSignal,
    job: { ...job, storefrontId, collectionId: null, inputJson: { ...job.inputJson, canonicalRootDomain: hostname }, updatedAt: now }
  });
  const payload: GenerationQueuePayload = {
    jobId: job.id,
    traceId,
    url: canonicalUrl,
    brandId,
    storefrontId,
    collectionId,
    dropId,
    slug,
    dnsClaimNonce,
    summonerWallet: input.summonerWallet || null,
    scoutUserId: input.scoutUserId || null,
    creatorDisplayName: input.creatorDisplayName || null,
    summonPaymentTxHash: input.summonPaymentTxHash || null,
    summonPaymentMetadataJson: input.summonPaymentMetadataJson || null
  };
  if (!redisConfigured() && process.env.NODE_ENV !== "production") {
    logger.info("queue.generation.inline_dev", {
      queue: "inline-dev",
      jobId: job.id,
      traceId,
      url: input.url
    });
    await recordEvent({
      entityType: "generation_job",
      entityId: job.id,
      eventType: "generation_queued",
      level: "info",
      message: "Generation job queued for inline development processing.",
      metadataJson: { queue: "inline-dev" },
      requestId: input.requestId || null,
      traceId
    });
    void runInlineDevelopmentGeneration(payload);
    return job;
  }
  const queue = generationQueue();
  const queued = await queue.add("generate_drop", payload, {
    jobId: job.id,
    ...defaultGenerationJobOptions()
  });
  logger.info("queue.generation.enqueued", {
    queue: GENERATION_QUEUE_NAME,
    jobId: job.id,
    bullJobId: queued.id,
    traceId,
    url: input.url
  });
  await recordEvent({
    entityType: "generation_job",
    entityId: job.id,
    eventType: "generation_queued",
    level: "info",
    message: "Generation job queued.",
    metadataJson: { queue: GENERATION_QUEUE_NAME, bullJobId: String(queued.id || "") },
    requestId: input.requestId || null,
    traceId
  });
  return job;
}

async function runInlineDevelopmentGeneration(input: GenerationQueuePayload) {
  try {
    const { generateDropFromUrl } = await import("./generateDrop");
    await updateGenerationJobStep(input.jobId, "INTAKE_CREATED");
    await recordEvent({
      entityType: "generation_job",
      entityId: input.jobId,
      eventType: "generation_worker_started",
      level: "info",
      message: "Inline development worker started processing queued job.",
      metadataJson: { queue: "inline-dev", attempt: 1 },
      requestId: null,
      traceId: input.traceId
    });
    await generateDropFromUrl(input.url, {
      jobId: input.jobId,
      traceId: input.traceId,
      brandId: input.brandId,
      storefrontId: input.storefrontId,
      collectionId: input.collectionId,
      dropId: input.dropId,
      slug: input.slug,
      dnsClaimNonce: input.dnsClaimNonce,
      summonerWallet: input.summonerWallet,
      scoutUserId: input.scoutUserId,
      creatorDisplayName: input.creatorDisplayName,
      summonPaymentTxHash: input.summonPaymentTxHash,
      summonPaymentMetadataJson: input.summonPaymentMetadataJson
    });
    logger.info("queue.generation.inline_dev.completed", {
      jobId: input.jobId,
      traceId: input.traceId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    logger.error("queue.generation.inline_dev.failed", {
      jobId: input.jobId,
      traceId: input.traceId,
      error: message
    });
    await updateGenerationJobStep(input.jobId, "FAILED", message);
    await recordEvent({
      entityType: "generation_job",
      entityId: input.jobId,
      eventType: "generation_worker_failed",
      level: "error",
      message,
      metadataJson: { queue: "inline-dev", attemptsMade: 1 },
      requestId: null,
      traceId: input.traceId
    });
  }
}
