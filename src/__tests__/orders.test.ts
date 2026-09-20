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
  updateOrderStatusService,
  listSellerOrdersService,
} from "../modules/orders/orders.service";
import { sendOrderConfirmedEmail } from "../tools/mail.tool";
import { notifyOrderStatus } from "../tools/notify.tool";
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

describe("updateOrderStatusService", () => {
  const updatedOrder = (status: string) => ({
    id: 7,
    userId: "buyer-1",
    status,
    user: { email: "buyer@test.com" },
    items: [
      { product: { seller: { userId: "seller-user-1" } } },
      { product: { seller: { userId: "seller-user-1" } } },
      { product: { seller: { userId: "seller-user-2" } } },
    ],
  });

  it("forbids a seller from updating an order without their products", async () => {
    db.order.findFirst.mockResolvedValue(null);

    const result = await updateOrderStatusService(
      7,
      { status: "shipped" } as any,
      "seller-user-9",
      "user" as any,
      "seller-9"
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/forbidden/i);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("checks ownership through sellerId when provided", async () => {
    db.order.findFirst.mockResolvedValue({ id: 7 });
    db.order.update.mockResolvedValue(updatedOrder("shipped"));

    await updateOrderStatusService(7, { status: "shipped" } as any, "u", "user" as any, "seller-1");

    expect(db.order.findFirst.mock.calls[0][0].where.items.some.product).toEqual({
      sellerId: "seller-1",
    });
  });

  it("falls back to the seller's userId when sellerId is missing", async () => {
    db.order.findFirst.mockResolvedValue({ id: 7 });
    db.order.update.mockResolvedValue(updatedOrder("shipped"));

    await updateOrderStatusService(7, { status: "shipped" } as any, "u1", "user" as any, null);

    expect(db.order.findFirst.mock.calls[0][0].where.items.some.product).toEqual({
      seller: { userId: "u1" },
    });
  });

  it("lets an admin skip the ownership check", async () => {
    db.order.update.mockResolvedValue(updatedOrder("shipped"));

    const result = await updateOrderStatusService(
      7,
      { status: "shipped" } as any,
      "admin-1",
      "admin" as any
    );

    expect(result.ok).toBe(true);
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it("does not email or notify for statuses other than confirmed", async () => {
    db.order.findFirst.mockResolvedValue({ id: 7 });
    db.order.update.mockResolvedValue(updatedOrder("shipped"));

    await updateOrderStatusService(7, { status: "shipped" } as any, "u", "user" as any, "s1");

    expect(sendOrderConfirmedEmail).not.toHaveBeenCalled();
    expect(notifyOrderStatus).not.toHaveBeenCalled();
  });

  it("emails the buyer and notifies buyer and each distinct seller on confirmed", async () => {
    db.order.findFirst.mockResolvedValue({ id: 7 });
    db.order.update.mockResolvedValue(updatedOrder("confirmed"));

    const result = await updateOrderStatusService(
      7,
      { status: "confirmed" } as any,
      "u",
      "user" as any,
      "s1"
    );

    expect(result.ok).toBe(true);
    expect(sendOrderConfirmedEmail).toHaveBeenCalledWith("buyer@test.com", 7);
    const notified = (notifyOrderStatus as any).mock.calls.map((c: any[]) => c[0]);
    expect(notified.sort()).toEqual(["buyer-1", "seller-user-1", "seller-user-2"]);
  });

  it("maps Prisma P2025 to 'Order not found'", async () => {
    db.order.update.mockRejectedValue({ code: "P2025" });

    const result = await updateOrderStatusService(
      7,
      { status: "shipped" } as any,
      "admin-1",
      "admin" as any
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Order not found");
  });
});

describe("listSellerOrdersService", () => {
  it("queries orders that contain the seller's products", async () => {
    db.order.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await listSellerOrdersService("seller-user-1");

    expect(result.ok).toBe(true);
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({
      items: { some: { product: { seller: { userId: "seller-user-1" } } } },
    });
  });

  it("returns not found when there are none", async () => {
    db.order.findMany.mockResolvedValue([]);

    const result = await listSellerOrdersService("seller-user-1");

    expect(result.ok).toBe(false);
  });
});
