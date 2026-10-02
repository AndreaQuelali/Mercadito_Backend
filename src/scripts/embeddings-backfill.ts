import { findProductsToIndex } from "../modules/search/indexing.service";
import { closeEmbeddingsQueue, enqueueProductEmbeddings } from "../tools/embeddingQueue.tool";
import { embeddingsAvailable } from "../tools/embeddings.tool";
import { disconnectPrisma } from "../config/prisma";

/** Queue every product without an embedding, or with an outdated hash or model. Run with `npm run embeddings:backfill`. */
async function main() {
  if (!embeddingsAvailable()) {
    console.warn("VOYAGE_API_KEY is empty: jobs are queued, but nothing will index them until a key is set.");
  }
  const ids = await findProductsToIndex();
  const queued = await enqueueProductEmbeddings(ids);
  console.log(`Queued ${queued} product(s) for indexing.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEmbeddingsQueue();
    await disconnectPrisma();
  });
