import { describe, it, expect, vi, beforeEach } from "vitest";

const emit = vi.fn();
const to = vi.fn(() => ({ emit }));
const getIO = vi.fn(() => ({ to }));

vi.mock("../config/socket", () => ({ getIO: () => getIO() }));
vi.mock("../config/prisma", () => ({
  default: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    product: { findUnique: vi.fn() },
  },
}));

import {
  notifyUser,
  notifyOrderStatus,
  notifyOrderCreated,
  notifyNewReview,
} from "../tools/notify.tool";
import {
  listNotificationsService,
  markNotificationReadService,
  markAllNotificationsReadService,
} from "../modules/notifications/notifications.service";
import { ENV } from "../config/env.config";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  to.mockImplementation(() => ({ emit }));
  getIO.mockImplementation(() => ({ to }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("notifyUser", () => {
  it("persists the notification and emits it to the user's room", async () => {
    db.notification.create.mockResolvedValue({ id: 1 });

    await notifyUser("u1", "order:new", { orderId: 3 });

    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: "u1", type: "order:new", payload: { orderId: 3 } },
    });
    expect(to).toHaveBeenCalledWith("user:u1");
    expect(emit).toHaveBeenCalledWith("order:new", { orderId: 3 });
  });

  it("still emits when persisting fails", async () => {
    db.notification.create.mockRejectedValue(new Error("db down"));

    await expect(notifyUser("u1", "stock:low", { productId: 1 })).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith("stock:low", { productId: 1 });
  });

  it("still persists and does not throw when the socket is not initialized", async () => {
    getIO.mockImplementation(() => {
      throw new Error("Socket.IO not initialized");
    });
    db.notification.create.mockResolvedValue({ id: 1 });

    await expect(notifyUser("u1", "review:new", { productId: 1 })).resolves.toBeUndefined();

    expect(db.notification.create).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("notifyOrderStatus", () => {
  it("keeps the order:status event and payload used by the frontend", async () => {
    db.notification.create.mockResolvedValue({ id: 1 });

    await notifyOrderStatus("u1", 7, "confirmed");

    expect(emit).toHaveBeenCalledWith("order:status", { orderId: 7, status: "confirmed" });
  });
});

describe("notifyOrderCreated", () => {
  const sale = (over: Partial<any> = {}) => ({
    sellerUserId: "seller-1",
    productId: 1,
    name: "Tomate",
    quantity: 2,
    stock: 50,
    ...over,
  });

  beforeEach(() => db.notification.create.mockResolvedValue({ id: 1 }));

  it("sends one order:new per seller with only that seller's items", async () => {
    await notifyOrderCreated(9, [
      sale(),
      sale({ productId: 2, name: "Pan" }),
      sale({ sellerUserId: "seller-2", productId: 3, name: "Queso" }),
    ]);

    const orderNew = emit.mock.calls.filter((c) => c[0] === "order:new");
    expect(orderNew).toHaveLength(2);
    const rooms = to.mock.calls.map((c: any[]) => c[0]);
    expect(rooms).toContain("user:seller-1");
    expect(rooms).toContain("user:seller-2");
    const forSeller1 = db.notification.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.userId === "seller-1" && d.type === "order:new");
    expect(forSeller1.payload).toEqual({
      orderId: 9,
      items: [
        { productId: 1, name: "Tomate", quantity: 2 },
        { productId: 2, name: "Pan", quantity: 2 },
      ],
    });
  });

  it("does not emit stock:low while stock is above the threshold", async () => {
    await notifyOrderCreated(9, [sale({ stock: ENV.LOW_STOCK_THRESHOLD + 1 })]);

    expect(emit.mock.calls.some((c) => c[0] === "stock:low")).toBe(false);
  });

  it("emits stock:low when stock reaches the threshold", async () => {
    await notifyOrderCreated(9, [sale({ stock: ENV.LOW_STOCK_THRESHOLD })]);

    expect(emit).toHaveBeenCalledWith("stock:low", {
      productId: 1,
      name: "Tomate",
      stock: ENV.LOW_STOCK_THRESHOLD,
      threshold: ENV.LOW_STOCK_THRESHOLD,
    });
  });

  it("emits stock:low when the product runs out", async () => {
    await notifyOrderCreated(9, [sale({ stock: 0 })]);

    expect(emit.mock.calls.some((c) => c[0] === "stock:low" && c[1].stock === 0)).toBe(true);
  });

  it("ignores lines whose seller is unknown", async () => {
    await notifyOrderCreated(9, [sale({ sellerUserId: undefined })]);

    expect(emit).not.toHaveBeenCalled();
  });
});

describe("notifyNewReview", () => {
  it("notifies the seller of the reviewed product", async () => {
    db.product.findUnique.mockResolvedValue({ name: "Tomate", seller: { userId: "seller-1" } });
    db.notification.create.mockResolvedValue({ id: 1 });

    await notifyNewReview(5, 4);

    expect(to).toHaveBeenCalledWith("user:seller-1");
    expect(emit).toHaveBeenCalledWith("review:new", { productId: 5, name: "Tomate", rating: 4 });
  });

  it("does nothing when the product is missing", async () => {
    db.product.findUnique.mockResolvedValue(null);

    await notifyNewReview(5, 4);

    expect(emit).not.toHaveBeenCalled();
  });

  it("never throws when the lookup fails", async () => {
    db.product.findUnique.mockRejectedValue(new Error("boom"));

    await expect(notifyNewReview(5, 4)).resolves.toBeUndefined();
  });
});

describe("listNotificationsService", () => {
  it("lists only the requester's notifications, newest first, with paging", async () => {
    db.notification.findMany.mockResolvedValue([{ id: 2 }]);
    db.notification.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);

    const result = await listNotificationsService("u1", { page: 2, limit: 5 });

    expect(result.ok).toBe(true);
    expect(db.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 5,
    });
    expect(result.data).toEqual({ items: [{ id: 2 }], total: 12, unread: 3, page: 2, limit: 5 });
  });

  it("filters unread notifications", async () => {
    db.notification.findMany.mockResolvedValue([]);
    db.notification.count.mockResolvedValue(0);

    await listNotificationsService("u1", { page: 1, limit: 20, unread: true });

    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      readAt: null,
    });
  });

  it("returns ok=false when the database fails", async () => {
    db.notification.findMany.mockRejectedValue(new Error("boom"));

    const result = await listNotificationsService("u1", { page: 1, limit: 20 });

    expect(result.ok).toBe(false);
  });
});

describe("markNotificationReadService", () => {
  it("returns not found for a notification of another user", async () => {
    db.notification.findFirst.mockResolvedValue(null);

    const result = await markNotificationReadService("u1", 4);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
    expect(db.notification.findFirst).toHaveBeenCalledWith({ where: { id: 4, userId: "u1" } });
    expect(db.notification.update).not.toHaveBeenCalled();
  });

  it("marks an unread notification as read", async () => {
    db.notification.findFirst.mockResolvedValue({ id: 4, readAt: null });
    db.notification.update.mockResolvedValue({ id: 4, readAt: new Date() });

    const result = await markNotificationReadService("u1", 4);

    expect(result.ok).toBe(true);
    expect(db.notification.update.mock.calls[0][0].where).toEqual({ id: 4 });
    expect(db.notification.update.mock.calls[0][0].data.readAt).toBeInstanceOf(Date);
  });

  it("is idempotent for an already read notification", async () => {
    const readAt = new Date("2026-01-01");
    db.notification.findFirst.mockResolvedValue({ id: 4, readAt });

    const result = await markNotificationReadService("u1", 4);

    expect(result.ok).toBe(true);
    expect(db.notification.update).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsReadService", () => {
  it("marks every unread notification of the requester", async () => {
    db.notification.updateMany.mockResolvedValue({ count: 3 });

    const result = await markAllNotificationsReadService("u1");

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ updated: 3 });
    const args = db.notification.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", readAt: null });
    expect(args.data.readAt).toBeInstanceOf(Date);
  });
});
