import { Worker } from "bullmq";
import { GENERATION_QUEUE_NAME, redisConnection, type GenerationQueuePayload } from "./lib/queues";
import { generateDropFromUrl } from "./lib/generateDrop";
import { logger } from "./lib/logger";
import { recordEvent, updateGenerationJobStep } from "./lib/store";

const concurrency = Number(process.env.DROPLINK_WORKER_CONCURRENCY || 1);

logger.info("worker.starting", {
  queue: GENERATION_QUEUE_NAME,
  concurrency
});

const worker = new Worker<GenerationQueuePayload>(
  GENERATION_QUEUE_NAME,
  async (job) => {
    const input = job.data;
    await updateGenerationJobStep(input.jobId, "INTAKE_CREATED");
    await recordEvent({
      entityType: "generation_job",
      entityId: input.jobId,
      eventType: "generation_worker_started",
      level: "info",
      message: "Generation worker started processing queued job.",
      metadataJson: { bullJobId: String(job.id || ""), attempt: job.attemptsMade + 1 },
      requestId: null,
      traceId: input.traceId
    });
    return generateDropFromUrl(input.url, {
      jobId: input.jobId,
      traceId: input.traceId,
      brandId: input.brandId,
      storefrontId: input.storefrontId,
      collectionId: input.collectionId,
      dropId: input.dropId,
      slug: input.slug,
      dnsClaimNonce: input.dnsClaimNonce,
      summonerWallet: input.summonerWallet,
      creatorDisplayName: input.creatorDisplayName,
      summonPaymentTxHash: input.summonPaymentTxHash,
      summonPaymentMetadataJson: input.summonPaymentMetadataJson
    });
  },
  {
    connection: redisConnection(),
    concurrency,
    lockDuration: 10 * 60 * 1000,
    stalledInterval: 60 * 1000
  }
);

worker.on("completed", (job) => {
  logger.info("worker.job.completed", {
    queue: GENERATION_QUEUE_NAME,
    jobId: job.data.jobId,
    bullJobId: job.id,
    traceId: job.data.traceId
  });
});

worker.on("failed", async (job, error) => {
  logger.error("worker.job.failed", {
    queue: GENERATION_QUEUE_NAME,
    jobId: job?.data.jobId,
    bullJobId: job?.id,
    traceId: job?.data.traceId,
    error: error.message
  });
  if (job) {
    await updateGenerationJobStep(job.data.jobId, "FAILED", error.message);
    await recordEvent({
      entityType: "generation_job",
      entityId: job.data.jobId,
      eventType: "generation_worker_failed",
      level: "error",
      message: error.message,
      metadataJson: { bullJobId: String(job.id || ""), attemptsMade: job.attemptsMade },
      requestId: null,
      traceId: job.data.traceId
    });
  }
});

async function shutdown(signal: string) {
  logger.info("worker.stopping", { signal });
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
