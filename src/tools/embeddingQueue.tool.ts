import { Queue, Worker, Job, JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { ENV } from "../config/env.config";
import { embeddingsAvailable } from "./embeddings.tool";

export type EmbeddingJob = { productId: number };

export const EMBEDDINGS_QUEUE = "embeddings";

/** One pending job per product (deduplicated). BullMQ forbids ":" in custom ids, so "product-<id>". */
export const embeddingJobId = (productId: number) => `product-${productId}`;

export const EMBEDDING_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

// Created lazily so importing this module never opens a connection (tests, scripts)
let connection: IORedis | null = null;
let queue: Queue<EmbeddingJob> | null = null;

export function getEmbeddingsConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: ENV.REDIS_HOST,
      port: Number(ENV.REDIS_PORT),
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

function getQueue(): Queue<EmbeddingJob> {
  if (!queue) queue = new Queue<EmbeddingJob>(EMBEDDINGS_QUEUE, { connection: getEmbeddingsConnection() });
  return queue;
}

/**
 * Queue the indexing of one product. Never throws and never waits for Voyage:
 * saving a product must not depend on the embeddings provider or on Redis being up.
 */
export async function enqueueProductEmbedding(productId: number): Promise<boolean> {
  try {
    await getQueue().add("index", { productId }, { ...EMBEDDING_JOB_OPTIONS, jobId: embeddingJobId(productId) });
    return true;
  } catch (error) {
    console.error(`[embeddings] could not enqueue product ${productId}`, error);
    return false;
  }
}

/** Queue many products at once (backfill). Returns how many were accepted. */
export async function enqueueProductEmbeddings(productIds: number[]): Promise<number> {
  if (productIds.length === 0) return 0;
  await getQueue().addBulk(
    productIds.map((productId) => ({
      name: "index",
      data: { productId },
      opts: { ...EMBEDDING_JOB_OPTIONS, jobId: embeddingJobId(productId) },
    }))
  );
  return productIds.length;
}

export async function closeEmbeddingsQueue() {
  await queue?.close();
  await connection?.quit();
  queue = null;
  connection = null;
}

export function initEmbeddingsWorker() {
  if (!embeddingsAvailable()) {
    console.warn("[embeddings] VOYAGE_API_KEY is empty: products are not indexed and search runs in text mode");
    return null;
  }
  // Imported here so the queue module stays free of the database client in scripts that only enqueue
  const { indexProduct } = require("../modules/search/indexing.service") as typeof import("../modules/search/indexing.service");

  const worker = new Worker<EmbeddingJob>(
    EMBEDDINGS_QUEUE,
    async (job: Job<EmbeddingJob>) => {
      const result = await indexProduct(job.data.productId);
      console.log(`[embeddings:worker] product ${job.data.productId} ${result}`);
    },
    { connection: getEmbeddingsConnection() }
  );
  worker.on("failed", (job, err) => {
    console.error(`[embeddings:worker] job ${job?.id} failed (attempt ${job?.attemptsMade})`, err.message);
  });
  return worker;
}
