import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("../tools/mail.tool", () => ({ sendOrderConfirmedEmail: vi.fn() }));
vi.mock("../tools/notify.tool", () => ({ notifyOrderStatus: vi.fn() }));

import {
  listMyOrdersService,
  getOrderByIdService,
  listSellerOrdersService,
} from "../modules/orders/orders.service";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => vi.resetAllMocks());

describe("listMyOrdersService", () => {
  it("only queries the requester's orders", async () => {
    db.order.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await listMyOrdersService("u1");

    expect(result.ok).toBe(true);
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("returns not found when the user has no orders", async () => {
    db.order.findMany.mockResolvedValue([]);

    const result = await listMyOrdersService("u1");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("listMyOrdersService — grouping", () => {
  it("groups the orders of one purchase by checkoutId, with their total", async () => {
    db.order.findMany.mockResolvedValue([
      { id: 3, checkoutId: "c2", total: "30.00", fulfillment: "pickup", createdAt: "d2" },
      { id: 2, checkoutId: "c1", total: "10.50", fulfillment: "delivery", createdAt: "d1" },
      { id: 1, checkoutId: "c1", total: "4.50", fulfillment: "delivery", createdAt: "d1" },
    ]);

    const result = await listMyOrdersService("u1");

    expect(result.data!.map((g: any) => g.checkoutId)).toEqual(["c2", "c1"]);
    const c1 = result.data!.find((g: any) => g.checkoutId === "c1");
    expect(c1.orders.map((o: any) => o.id)).toEqual([2, 1]);
    expect(c1.total).toBe(15);
    expect(c1.fulfillment).toBe("delivery");
  });
});

describe("getOrderByIdService", () => {
  it("scopes the lookup to the requester", async () => {
    db.order.findFirst.mockResolvedValue({ id: 5 });

    const result = await getOrderByIdService("u1", 5);

    expect(result.ok).toBe(true);
    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 5, userId: "u1" });
  });

  it("returns not found for an order of another user", async () => {
    db.order.findFirst.mockResolvedValue(null);

    const result = await getOrderByIdService("u1", 5);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });
});

describe("listSellerOrdersService", () => {
  it("queries the orders of the seller's own stand", async () => {
    db.order.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await listSellerOrdersService("seller-user-1");

    expect(result.ok).toBe(true);
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({
      seller: { userId: "seller-user-1" },
    });
  });

  it("returns not found when there are none", async () => {
    db.order.findMany.mockResolvedValue([]);

    const result = await listSellerOrdersService("seller-user-1");

    expect(result.ok).toBe(false);
  });
});
