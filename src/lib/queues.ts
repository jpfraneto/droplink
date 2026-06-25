import { Queue, QueueEvents, type ConnectionOptions, type JobsOptions } from "bullmq";
import { newId } from "./hashes";
import { logger } from "./logger";
import { createGenerationJob, recordEvent, updateGenerationJobStep } from "./store";

export type GenerationQueuePayload = {
  jobId: string;
  traceId: string;
  url: string;
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
}) {
  const traceId = newId("run");
  const job = await createGenerationJob({
    traceId,
    type: "drop",
    inputJson: { url: input.url, type: "drop", queue: GENERATION_QUEUE_NAME }
  });
  const payload: GenerationQueuePayload = {
    jobId: job.id,
    traceId,
    url: input.url
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
      traceId: input.traceId
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
