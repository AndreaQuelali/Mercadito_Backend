import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    seller: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
  },
  prisma: { $connect: vi.fn() },
}));

import {
  createSellerService,
  updateSellerStatusService,
} from "../modules/sellers/sellers.service";
import { createProductService } from "../modules/products/products.service";
import { requiresActiveSeller } from "../middleware/userRole.middleware";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe("createSellerService", () => {
  it("creates an active seller profile", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "user" });
    db.seller.findUnique.mockResolvedValue(null);
    db.seller.create.mockResolvedValue({
      id: "s1",
      userId: "u1",
      businessName: "Puesto de Ana",
      status: "active",
    });

    const result = await createSellerService("u1", {
      businessName: "Puesto de Ana",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe("active");
    expect(db.seller.create).toHaveBeenCalledOnce();
  });

  it("returns conflict when seller already exists", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "user" });
    db.seller.findUnique.mockResolvedValue({ id: "s1", userId: "u1" });

    const result = await createSellerService("u1", {
      businessName: "Otro puesto",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already exists/i);
    expect(db.seller.create).not.toHaveBeenCalled();
  });

  it("rejects admin users", async () => {
    db.user.findUnique.mockResolvedValue({ id: "admin-1", role: "admin" });

    const result = await createSellerService("admin-1", {
      businessName: "Admin shop",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/admins cannot/i);
  });
});

describe("requiresActiveSeller", () => {
  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
  };

  it("allows active seller and attaches sellerId", async () => {
    const req: any = { user: { sub: "u1", sellerId: "s1" } };
    const res = mockRes();
    const next = vi.fn();
    db.seller.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "active",
    });

    await requiresActiveSeller(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user.sellerId).toBe("s1");
  });

  it("rejects user without seller profile", async () => {
    const req: any = { user: { sub: "u1", sellerId: null } };
    const res = mockRes();
    const next = vi.fn();
    db.seller.findUnique.mockResolvedValue(null);

    await requiresActiveSeller(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects suspended seller", async () => {
    const req: any = { user: { sub: "u1", sellerId: "s1" } };
    const res = mockRes();
    const next = vi.fn();
    db.seller.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "suspended",
    });

    await requiresActiveSeller(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("updateSellerStatusService", () => {
  it("admin can suspend and reactivate a seller", async () => {
    db.seller.update.mockResolvedValueOnce({
      id: "s1",
      status: "suspended",
    });
    const suspended = await updateSellerStatusService("s1", {
      status: "suspended",
    });
    expect(suspended.ok).toBe(true);
    expect(suspended.data?.status).toBe("suspended");

    db.seller.update.mockResolvedValueOnce({
      id: "s1",
      status: "active",
    });
    const active = await updateSellerStatusService("s1", { status: "active" });
    expect(active.ok).toBe(true);
    expect(active.data?.status).toBe("active");
  });
});

describe("createProductService with sellerId", () => {
  it("creates product owned by Seller.id", async () => {
    db.product = { create: vi.fn() };
    db.product.create.mockResolvedValue({
      id: 1,
      name: "Tomate",
      sellerId: "seller-uuid",
    });

    const result = await createProductService({
      name: "Tomate",
      price: 10 as any,
      stock: 5,
      unit: "kilogramo" as any,
      category: "verduras" as any,
      description: "Fresh",
      image: "http://img",
      sellerId: "seller-uuid",
    });

    expect(result.ok).toBe(true);
    expect(db.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sellerId: "seller-uuid" }),
    });
  });
});
