import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: { $queryRaw: vi.fn(), product: { findMany: vi.fn() } },
}));
const embeddings = vi.hoisted(() => ({
  embedQuery: vi.fn(),
  embeddingsAvailable: vi.fn(() => true),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}));
vi.mock("../tools/embeddings.tool", () => embeddings);

import prisma from "../config/prisma";
import { fuseRankings } from "../modules/search/fuseRankings";
import { checkSearchRateLimit } from "../modules/search/searchRateLimit";
import { searchProductsService } from "../modules/search/search.service";
import { SearchQuerySchema } from "../modules/search/schemas/searchQuery.schema";

const db = prisma as any;

describe("fuseRankings (RRF)", () => {
  it("ranks an item present in both lists above items in only one", () => {
    const fused = fuseRankings([[1, 2, 3], [3, 4]]);
    expect(fused[0].id).toBe(3);
    expect(fused.map((f) => f.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("scores with 1 / (60 + rank)", () => {
    const [first] = fuseRankings([[7]]);
    expect(first.score).toBeCloseTo(1 / 61);
  });

  it("keeps first-appearance order on ties", () => {
    expect(fuseRankings([[1], [2]]).map((f) => f.id)).toEqual([1, 2]);
  });

  it("works with a single list and with empty lists", () => {
    expect(fuseRankings([[5, 6]]).map((f) => f.id)).toEqual([5, 6]);
    expect(fuseRankings([[], []])).toEqual([]);
    expect(fuseRankings([])).toEqual([]);
  });

  it("counts a duplicate inside one list once", () => {
    expect(fuseRankings([[1, 1]])[0].score).toBeCloseTo(1 / 61);
  });
});

describe("checkSearchRateLimit", () => {
  const fakeStore = () => {
    const counts = new Map<string, number>();
    const ttls = new Map<string, number>();
    return {
      counts,
      ttls,
      incr: async (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1).get(k)!,
      expire: async (k: string, s: number) => void ttls.set(k, s),
      ttl: async (k: string) => ttls.get(k) ?? -1,
    };
  };

  it("allows N searches and blocks the N+1th with a Retry-After", async () => {
    const store = fakeStore();
    for (let i = 0; i < 3; i++) expect((await checkSearchRateLimit("u1", 3, store)).allowed).toBe(true);
    const blocked = await checkSearchRateLimit("u1", 3, store);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(60);
  });

  it("counts each user on their own", async () => {
    const store = fakeStore();
    await checkSearchRateLimit("u1", 1, store);
    expect((await checkSearchRateLimit("u2", 1, store)).allowed).toBe(true);
  });

  it("starts allowing again when the window resets", async () => {
    const store = fakeStore();
    await checkSearchRateLimit("u1", 1, store);
    expect((await checkSearchRateLimit("u1", 1, store)).allowed).toBe(false);
    store.counts.clear(); // Redis dropped the expired key
    expect((await checkSearchRateLimit("u1", 1, store)).allowed).toBe(true);
  });
});

describe("SearchQuerySchema", () => {
  it("applies defaults", () => {
    expect(SearchQuerySchema.parse({ q: " pan " })).toEqual({ q: "pan", limit: 10, includeOutOfStock: false });
  });

  it.each([
    [{ q: "" }],
    [{ q: "   " }],
    [{ q: "x".repeat(201) }],
    [{ q: "pan", limit: 26 }],
    [{ q: "pan", limit: 0 }],
    [{ q: "pan", category: "juguetes" }],
    [{ q: "pan", includeOutOfStock: "yes" }],
  ])("rejects %j", (input) => {
    expect(SearchQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("searchProductsService", () => {
  const query = SearchQuerySchema.parse({ q: "pan sin gluten", limit: 2 });
  const products = [1, 2, 3].map((id) => ({ id, name: `p${id}` }));

  beforeEach(() => {
    vi.resetAllMocks();
    embeddings.embeddingsAvailable.mockReturnValue(true);
    db.product.findMany.mockImplementation(async ({ where }: any) => products.filter((p) => where.id.in.includes(p.id)));
  });

  it("fuses the vector and text lists in hybrid mode and applies the limit", async () => {
    embeddings.embedQuery.mockResolvedValue([0.1]);
    db.$queryRaw.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);

    const result = await searchProductsService(query);

    expect(result.mode).toBe("hybrid");
    expect(result.items.map((i: any) => i.id)).toEqual([2, 1]);
    expect(result.items[0].score).toBeGreaterThan(result.items[1].score as number);
  });

  it("falls back to text mode when Voyage fails", async () => {
    embeddings.embedQuery.mockRejectedValue(new Error("voyage down"));
    db.$queryRaw.mockResolvedValueOnce([{ id: 3 }]);

    const result = await searchProductsService(query);

    expect(result.mode).toBe("text");
    expect(result.items.map((i: any) => i.id)).toEqual([3]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("uses text mode without calling Voyage when no key is configured", async () => {
    embeddings.embeddingsAvailable.mockReturnValue(false);
    db.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);

    const result = await searchProductsService(query);

    expect(result.mode).toBe("text");
    expect(embeddings.embedQuery).not.toHaveBeenCalled();
  });

  it("returns an empty list in hybrid mode when nothing relates to the query", async () => {
    embeddings.embedQuery.mockResolvedValue([0.1]);
    db.$queryRaw.mockResolvedValue([]);

    expect(await searchProductsService(query)).toEqual({ mode: "hybrid", items: [] });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("falls back to text when the vector query itself fails", async () => {
    embeddings.embedQuery.mockResolvedValue([0.1]);
    db.$queryRaw
      .mockRejectedValueOnce(new Error("vector extension missing")) // vector ranking
      .mockResolvedValueOnce([{ id: 1 }]) // text ranking of the failed attempt
      .mockResolvedValueOnce([{ id: 1 }]); // text ranking of the fallback

    const result = await searchProductsService(query);
    expect(result.mode).toBe("text");
    expect(result.items.map((i: any) => i.id)).toEqual([1]);
  });
});
