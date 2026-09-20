import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import {
  createProductService,
  getProductByIdService,
  listSellerProductsService,
  readProductService,
  updateProductService,
  deleteProductService,
} from "../modules/products/products.service";
import prisma from "../config/prisma";

const db = prisma as any;
const sellerId = "seller-1";

beforeEach(() => vi.resetAllMocks());

describe("createProductService", () => {
  it("creates a product and returns it", async () => {
    const payload = { name: "Tomate", sellerId } as any;
    db.product.create.mockResolvedValue({ id: 1, ...payload });

    const result = await createProductService(payload);

    expect(result.ok).toBe(true);
    expect(db.product.create).toHaveBeenCalledWith({ data: payload });
    expect(result.data?.id).toBe(1);
  });

  it("returns ok=false when the database fails", async () => {
    db.product.create.mockRejectedValue(new Error("db down"));

    const result = await createProductService({ name: "x" } as any);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/error creating product/i);
  });
});

describe("getProductByIdService", () => {
  it("returns the product when it exists", async () => {
    db.product.findUnique.mockResolvedValue({ id: 5, name: "Pan" });

    const result = await getProductByIdService(5);

    expect(result.ok).toBe(true);
    expect(db.product.findUnique).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("returns not found when the product does not exist", async () => {
    db.product.findUnique.mockResolvedValue(null);

    const result = await getProductByIdService(999);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("listSellerProductsService", () => {
  it("filters by sellerId", async () => {
    db.product.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await listSellerProductsService(sellerId);

    expect(result.ok).toBe(true);
    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns not found when the seller has no products", async () => {
    db.product.findMany.mockResolvedValue([]);

    const result = await listSellerProductsService(sellerId);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("readProductService — filters", () => {
  it("applies no filter when none is given", async () => {
    db.product.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await readProductService();

    expect(result.ok).toBe(true);
    expect(db.product.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("builds name, category and price range filters", async () => {
    db.product.findMany.mockResolvedValue([{ id: 1 }]);

    await readProductService({
      name: "tom",
      category: "verduras",
      minPrice: 2,
      maxPrice: 10,
    } as any);

    expect(db.product.findMany.mock.calls[0][0].where).toEqual({
      name: { contains: "tom", mode: "insensitive" },
      category: "verduras",
      price: { gte: 2, lte: 10 },
    });
  });

  it("keeps minPrice=0 as a valid filter", async () => {
    db.product.findMany.mockResolvedValue([]);

    await readProductService({ minPrice: 0 } as any);

    expect(db.product.findMany.mock.calls[0][0].where.price).toEqual({ gte: 0 });
  });

  it("builds a date range filter", async () => {
    db.product.findMany.mockResolvedValue([]);

    await readProductService({
      startAt: "2026-01-01",
      endAt: "2026-02-01",
    } as any);

    const where = db.product.findMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date("2026-01-01"));
    expect(where.createdAt.lte).toEqual(new Date("2026-02-01"));
  });

  it("returns ok=true with an empty array when nothing matches", async () => {
    db.product.findMany.mockResolvedValue([]);

    const result = await readProductService({ name: "zzz" } as any);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns ok=false when the database fails", async () => {
    db.product.findMany.mockRejectedValue(new Error("boom"));

    const result = await readProductService();

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
  });
});

describe("updateProductService", () => {
  it("updates the product when the requester owns it", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, sellerId });
    db.product.update.mockResolvedValue({ id: 1, sellerId, stock: 9 });

    const result = await updateProductService(1, { stock: 9 } as any, sellerId);

    expect(result.ok).toBe(true);
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { stock: 9 },
    });
  });

  it("returns not found when the product does not exist", async () => {
    db.product.findUnique.mockResolvedValue(null);

    const result = await updateProductService(1, {} as any, sellerId);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it("refuses to update a product owned by another seller", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, sellerId: "other" });

    const result = await updateProductService(1, { stock: 1 } as any, sellerId);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/forbidden/i);
    expect(db.product.update).not.toHaveBeenCalled();
  });
});

describe("deleteProductService", () => {
  it("deletes the product when the requester owns it", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, sellerId });
    db.product.delete.mockResolvedValue({ id: 1, sellerId });

    const result = await deleteProductService(1, sellerId);

    expect(result.ok).toBe(true);
    expect(db.product.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("returns not found when the product does not exist", async () => {
    db.product.findUnique.mockResolvedValue(null);

    const result = await deleteProductService(1, sellerId);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it("refuses to delete a product owned by another seller", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, sellerId: "other" });

    const result = await deleteProductService(1, sellerId);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/forbidden/i);
    expect(db.product.delete).not.toHaveBeenCalled();
  });
});
