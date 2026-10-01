-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "productId" INTEGER NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "ProductEmbedding" ADD CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity (cosine) and Spanish full-text indexes (not expressible in Prisma)
CREATE INDEX "ProductEmbedding_embedding_hnsw_idx"
  ON "ProductEmbedding" USING hnsw (embedding vector_cosine_ops);
CREATE INDEX "Product_search_spanish_idx"
  ON "Product" USING gin (to_tsvector('spanish', name || ' ' || description));
