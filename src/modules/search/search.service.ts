import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { ENV } from "../../config/env.config";
import { embedQuery, embeddingsAvailable, toVectorLiteral } from "../../tools/embeddings.tool";
import { fuseRankings } from "./fuseRankings";
import { SearchQuery } from "./schemas/searchQuery.schema";

export type SearchMode = "hybrid" | "text";

export interface SearchResults {
  mode: SearchMode;
  items: Record<string, unknown>[];
}

/** How many candidates each ranking contributes before fusion */
const CANDIDATES = 50;

function filters(query: SearchQuery): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (!query.includeOutOfStock) parts.push(Prisma.sql`p."stock" > 0`);
  if (query.category) parts.push(Prisma.sql`p."category" = ${query.category}::"Category"`);
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

async function textRanking(query: SearchQuery): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT p."id"
    FROM "Product" p
    WHERE to_tsvector('spanish', p."name" || ' ' || p."description") @@ plainto_tsquery('spanish', ${query.q})
    ${filters(query)}
    ORDER BY ts_rank(to_tsvector('spanish', p."name" || ' ' || p."description"), plainto_tsquery('spanish', ${query.q})) DESC, p."id"
    LIMIT ${CANDIDATES}
  `;
  return rows.map((r) => r.id);
}

async function vectorRanking(query: SearchQuery, vector: number[]): Promise<number[]> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT p."id"
    FROM "ProductEmbedding" e
    JOIN "Product" p ON p."id" = e."productId"
    WHERE 1 - (e."embedding" <=> ${literal}::vector) >= ${ENV.SEARCH_MIN_SIMILARITY}
    ${filters(query)}
    ORDER BY e."embedding" <=> ${literal}::vector
    LIMIT ${CANDIDATES}
  `;
  return rows.map((r) => r.id);
}

/** Hybrid search: vector + text rankings fused with RRF; text only when Voyage is unavailable */
export async function searchProductsService(query: SearchQuery): Promise<SearchResults> {
  let vector: number[] | null = null;
  if (embeddingsAvailable()) {
    try {
      vector = await embedQuery(query.q);
    } catch (error) {
      console.warn("[search] embeddings unavailable, falling back to text search:", (error as Error).message);
    }
  }

  let mode: SearchMode = "text";
  let lists: number[][];
  if (vector) {
    try {
      lists = await Promise.all([vectorRanking(query, vector), textRanking(query)]);
      mode = "hybrid";
    } catch (error) {
      console.warn("[search] vector query failed, falling back to text search:", (error as Error).message);
      lists = [await textRanking(query)];
    }
  } else {
    lists = [await textRanking(query)];
  }

  const fused = fuseRankings(lists).slice(0, query.limit);
  if (fused.length === 0) return { mode, items: [] };

  const products = await prisma.product.findMany({ where: { id: { in: fused.map((f) => f.id) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = fused
    .filter((f) => byId.has(f.id))
    .map((f) => ({ ...byId.get(f.id)!, score: f.score }));
  return { mode, items };
}
