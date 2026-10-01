import prisma from "../../config/prisma";
import { embedDocuments, embeddingModelName, toVectorLiteral } from "../../tools/embeddings.tool";
import { buildProductDocument, contentHash } from "./productDocument";

export type IndexResult = "indexed" | "unchanged" | "missing";

/**
 * Embed one product and upsert its vector. Calls the provider only when the indexed text
 * or the model changed. Errors from the provider propagate so the queue retries the job.
 */
export async function indexProduct(productId: number): Promise<IndexResult> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return "missing"; // deleted before the job ran; the embedding cascaded away

  const text = buildProductDocument(product);
  const hash = contentHash(text);
  const model = embeddingModelName();

  const current = await prisma.$queryRaw<{ contentHash: string; model: string }[]>`
    SELECT "contentHash", "model" FROM "ProductEmbedding" WHERE "productId" = ${productId}
  `;
  if (current[0] && current[0].contentHash === hash && current[0].model === model) return "unchanged";

  const [vector] = await embedDocuments([text]);
  const literal = toVectorLiteral(vector);

  await prisma.$executeRaw`
    INSERT INTO "ProductEmbedding" ("productId", "embedding", "contentHash", "model", "updatedAt")
    VALUES (${productId}, ${literal}::vector, ${hash}, ${model}, NOW())
    ON CONFLICT ("productId") DO UPDATE
      SET "embedding" = EXCLUDED."embedding",
          "contentHash" = EXCLUDED."contentHash",
          "model" = EXCLUDED."model",
          "updatedAt" = NOW()
  `;
  return "indexed";
}

interface BackfillCandidate {
  id: number;
  name: string;
  description: string;
  category: string;
  unit: string;
  embedding: { contentHash: string; model: string } | null;
}

/** Pure selection: products without an embedding, or with an outdated hash or model */
export function selectStaleProducts(products: BackfillCandidate[], model: string): number[] {
  return products
    .filter((p) => !p.embedding || p.embedding.model !== model || p.embedding.contentHash !== contentHash(buildProductDocument(p)))
    .map((p) => p.id);
}

/** Ids of the products that need (re)indexing */
export async function findProductsToIndex(): Promise<number[]> {
  const [products, embeddings] = await Promise.all([
    prisma.product.findMany({ select: { id: true, name: true, description: true, category: true, unit: true } }),
    prisma.$queryRaw<{ productId: number; contentHash: string; model: string }[]>`
      SELECT "productId", "contentHash", "model" FROM "ProductEmbedding"
    `,
  ]);
  const byProduct = new Map(embeddings.map((e) => [e.productId, e]));
  return selectStaleProducts(
    products.map((p) => ({ ...p, embedding: byProduct.get(p.id) ?? null })),
    embeddingModelName()
  );
}
