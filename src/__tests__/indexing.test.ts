import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    product: { findUnique: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));
const embeddings = vi.hoisted(() => ({
  embedDocuments: vi.fn(),
  embeddingModelName: vi.fn(() => "voyage-3.5-lite"),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}));
vi.mock("../tools/embeddings.tool", () => embeddings);

import prisma from "../config/prisma";
import { indexProduct, selectStaleProducts } from "../modules/search/indexing.service";
import { buildProductDocument, contentHash } from "../modules/search/productDocument";

const db = prisma as any;
const product = { id: 1, name: "Tomate", description: "Tomate fresco de valle", category: "verduras", unit: "kilogramo" };

beforeEach(() => {
  vi.resetAllMocks();
  embeddings.embeddingModelName.mockReturnValue("voyage-3.5-lite");
});

describe("buildProductDocument", () => {
  it("joins name, description, category and unit", () => {
    expect(buildProductDocument(product)).toBe(
      "Tomate. Tomate fresco de valle. Categoría: verduras. Se vende por kilogramo."
    );
  });

  it("does not double the final period of the description", () => {
    expect(buildProductDocument({ ...product, description: "Fresco.  " })).toContain("Tomate. Fresco. Categoría");
  });
});

describe("indexProduct", () => {
  it("embeds and stores a new product", async () => {
    db.product.findUnique.mockResolvedValue(product);
    db.$queryRaw.mockResolvedValue([]);
    embeddings.embedDocuments.mockResolvedValue([[0.1, 0.2]]);

    await expect(indexProduct(1)).resolves.toBe("indexed");

    expect(embeddings.embedDocuments).toHaveBeenCalledWith([buildProductDocument(product)]);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does not call Voyage when the content and model did not change", async () => {
    db.product.findUnique.mockResolvedValue(product);
    db.$queryRaw.mockResolvedValue([{ contentHash: contentHash(buildProductDocument(product)), model: "voyage-3.5-lite" }]);

    await expect(indexProduct(1)).resolves.toBe("unchanged");

    expect(embeddings.embedDocuments).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("reindexes when the model is different", async () => {
    db.product.findUnique.mockResolvedValue(product);
    db.$queryRaw.mockResolvedValue([{ contentHash: contentHash(buildProductDocument(product)), model: "old-model" }]);
    embeddings.embedDocuments.mockResolvedValue([[0.1]]);

    await expect(indexProduct(1)).resolves.toBe("indexed");
    expect(embeddings.embedDocuments).toHaveBeenCalledTimes(1);
  });

  it("lets a Voyage error fail the job so the queue retries it", async () => {
    db.product.findUnique.mockResolvedValue(product);
    db.$queryRaw.mockResolvedValue([]);
    embeddings.embedDocuments.mockRejectedValue(new Error("voyage down"));

    await expect(indexProduct(1)).rejects.toThrow("voyage down");
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("skips a product that was deleted before the job ran", async () => {
    db.product.findUnique.mockResolvedValue(null);
    await expect(indexProduct(9)).resolves.toBe("missing");
    expect(embeddings.embedDocuments).not.toHaveBeenCalled();
  });
});

describe("selectStaleProducts", () => {
  const current = { contentHash: contentHash(buildProductDocument(product)), model: "m" };

  it("selects products without an embedding, with an old hash, or with another model", () => {
    const ids = selectStaleProducts(
      [
        { ...product, id: 1, embedding: null },
        { ...product, id: 2, embedding: { ...current, contentHash: "stale" } },
        { ...product, id: 3, embedding: { ...current, model: "other" } },
        { ...product, id: 4, embedding: current },
      ],
      "m"
    );
    expect(ids).toEqual([1, 2, 3]);
  });

  it("returns nothing when everything is up to date", () => {
    expect(selectStaleProducts([{ ...product, embedding: current }], "m")).toEqual([]);
  });
});
