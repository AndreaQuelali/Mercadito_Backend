import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const emit = vi.fn();
const to = vi.fn(() => ({ emit }));
const getIO = vi.fn(() => ({ to }));

vi.mock("../config/socket", () => ({ getIO: () => getIO() }));
vi.mock("../config/prisma", () => ({
  default: {
    seller: { findUnique: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

import {
  DEFAULT_PREFS,
  normalizePrefs,
  isEventEnabled,
} from "../modules/sellers/notificationPrefs";
import {
  getNotificationSettingsService,
  updateNotificationSettingsService,
} from "../modules/sellers/sellers.service";
import { NotificationSettingsSchema } from "../modules/sellers/schemas/notificationSettings.schema";
import { notifyUser } from "../tools/notify.tool";
import { ENV } from "../config/env.config";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  to.mockImplementation(() => ({ emit }));
  getIO.mockImplementation(() => ({ to }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("normalizePrefs", () => {
  it("enables every event when nothing was stored", () => {
    expect(normalizePrefs(null)).toEqual({ "order:new": true, "stock:low": true, "review:new": true });
    expect(DEFAULT_PREFS).toEqual(normalizePrefs(undefined));
  });

  it("keeps stored booleans and fills the missing ones", () => {
    expect(normalizePrefs({ "stock:low": false })).toEqual({
      "order:new": true,
      "stock:low": false,
      "review:new": true,
    });
  });

  it("ignores garbage values and unknown keys", () => {
    expect(normalizePrefs({ "order:new": "no", "review:new": 0, other: false })).toEqual({
      "order:new": true,
      "stock:low": true,
      "review:new": true,
    });
    expect(normalizePrefs("nonsense")).toEqual(DEFAULT_PREFS);
  });
});

describe("isEventEnabled", () => {
  it("only mutes the events explicitly set to false", () => {
    expect(isEventEnabled({ "stock:low": false }, "stock:low")).toBe(false);
    expect(isEventEnabled({ "stock:low": false }, "order:new")).toBe(true);
    expect(isEventEnabled(null, "review:new")).toBe(true);
  });

  it("never mutes events a seller cannot configure", () => {
    expect(isEventEnabled({ "order:status": false } as any, "order:status")).toBe(true);
  });
});

describe("NotificationSettingsSchema", () => {
  it("accepts a partial update", () => {
    expect(NotificationSettingsSchema.safeParse({ "stock:low": false }).success).toBe(true);
  });

  it("accepts every event at once", () => {
    const all = { "order:new": true, "stock:low": false, "review:new": true };
    expect(NotificationSettingsSchema.safeParse(all).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(NotificationSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean values and unknown events", () => {
    expect(NotificationSettingsSchema.safeParse({ "stock:low": "yes" }).success).toBe(false);
    expect(NotificationSettingsSchema.safeParse({ "order:status": false }).success).toBe(false);
  });
});

describe("getNotificationSettingsService", () => {
  it("returns the normalized preferences and the server's low stock threshold", async () => {
    db.seller.findUnique.mockResolvedValue({ id: "s1", notificationPrefs: { "review:new": false } });

    const result = await getNotificationSettingsService("s1");

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      preferences: { "order:new": true, "stock:low": true, "review:new": false },
      lowStockThreshold: ENV.LOW_STOCK_THRESHOLD,
    });
    expect(db.seller.findUnique.mock.calls[0][0].where).toEqual({ id: "s1" });
  });

  it("defaults to everything on for a seller that never configured it", async () => {
    db.seller.findUnique.mockResolvedValue({ id: "s1", notificationPrefs: null });

    const result = await getNotificationSettingsService("s1");

    expect(result.data.preferences).toEqual(DEFAULT_PREFS);
  });

  it("returns not found for an unknown seller", async () => {
    db.seller.findUnique.mockResolvedValue(null);

    const result = await getNotificationSettingsService("nope");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it("returns ok=false when the database fails", async () => {
    db.seller.findUnique.mockRejectedValue(new Error("boom"));

    expect((await getNotificationSettingsService("s1")).ok).toBe(false);
  });
});

describe("updateNotificationSettingsService", () => {
  it("merges the patch over the stored preferences and saves the full object", async () => {
    db.seller.findUnique.mockResolvedValue({ id: "s1", notificationPrefs: { "order:new": false } });
    db.seller.update.mockImplementation(async ({ data }: any) => ({ id: "s1", notificationPrefs: data.notificationPrefs }));

    const result = await updateNotificationSettingsService("s1", { "stock:low": false });

    expect(db.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: { notificationPrefs: { "order:new": false, "stock:low": false, "review:new": true } },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.data.preferences).toEqual({ "order:new": false, "stock:low": false, "review:new": true });
    expect(result.data.lowStockThreshold).toBe(ENV.LOW_STOCK_THRESHOLD);
  });

  it("can turn an event back on", async () => {
    db.seller.findUnique.mockResolvedValue({ id: "s1", notificationPrefs: { "stock:low": false } });
    db.seller.update.mockImplementation(async ({ data }: any) => ({ id: "s1", notificationPrefs: data.notificationPrefs }));

    const result = await updateNotificationSettingsService("s1", { "stock:low": true });

    expect(result.data.preferences["stock:low"]).toBe(true);
  });

  it("returns not found for an unknown seller without writing", async () => {
    db.seller.findUnique.mockResolvedValue(null);

    const result = await updateNotificationSettingsService("nope", { "stock:low": false });

    expect(result.ok).toBe(false);
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it("returns ok=false when saving fails", async () => {
    db.seller.findUnique.mockResolvedValue({ id: "s1", notificationPrefs: null });
    db.seller.update.mockRejectedValue(new Error("boom"));

    expect((await updateNotificationSettingsService("s1", { "stock:low": false })).ok).toBe(false);
  });
});

describe("notifyUser honours the seller's preferences", () => {
  beforeEach(() => db.notification.create.mockResolvedValue({ id: 1 }));

  it("neither stores nor emits an event the seller turned off", async () => {
    db.seller.findUnique.mockResolvedValue({ notificationPrefs: { "stock:low": false } });

    await notifyUser("u1", "stock:low", { productId: 1 });

    expect(db.notification.create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(db.seller.findUnique.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("still delivers the events that stay on", async () => {
    db.seller.findUnique.mockResolvedValue({ notificationPrefs: { "stock:low": false } });

    await notifyUser("u1", "order:new", { orderId: 1 });

    expect(db.notification.create).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith("order:new", { orderId: 1 });
  });

  it("delivers when the user has no seller profile or no preferences", async () => {
    db.seller.findUnique.mockResolvedValue(null);

    await notifyUser("u1", "review:new", { productId: 1 });

    expect(emit).toHaveBeenCalledOnce();
  });

  it("delivers anyway when the preferences cannot be read", async () => {
    db.seller.findUnique.mockRejectedValue(new Error("db down"));

    await notifyUser("u1", "order:new", { orderId: 1 });

    expect(emit).toHaveBeenCalledOnce();
  });

  it("does not even look up preferences for order:status", async () => {
    await notifyUser("u1", "order:status", { orderId: 1, status: "confirmed" });

    expect(db.seller.findUnique).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledOnce();
  });
});

describe("notification settings controller", () => {
  const getService = vi.fn();
  const updateService = vi.fn();
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../modules/sellers/sellers.service", () => ({
      createSellerService: vi.fn(),
      deleteMySellerService: vi.fn(),
      getMySellerService: vi.fn(),
      getSellerSalesService: vi.fn(),
      listSellersService: vi.fn(),
      updateMySellerService: vi.fn(),
      updateSellerStatusService: vi.fn(),
      getNotificationSettingsService: getService,
      updateNotificationSettingsService: updateService,
    }));
    const { getNotificationSettings, updateNotificationSettings } = await import(
      "../modules/sellers/sellers.controller"
    );
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { sub: "u1", sellerId: "seller-9" };
      next();
    });
    app.get("/settings", getNotificationSettings);
    app.patch("/settings", updateNotificationSettings);
    getService.mockReset();
    updateService.mockReset();
  });

  it("GET returns the settings of the seller of the session", async () => {
    getService.mockResolvedValue({ ok: true, message: "ok", data: { lowStockThreshold: 5 } });

    const res = await request(app).get("/settings");

    expect(res.status).toBe(200);
    expect(getService).toHaveBeenCalledWith("seller-9");
    expect(res.body.data).toEqual({ lowStockThreshold: 5 });
  });

  it("GET answers 404 when the seller disappeared", async () => {
    getService.mockResolvedValue({ ok: false, message: "Seller not found" });

    expect((await request(app).get("/settings")).status).toBe(404);
  });

  it("PATCH validates the body", async () => {
    const res = await request(app).patch("/settings").send({ "stock:low": "yes" });

    expect(res.status).toBe(400);
    expect(updateService).not.toHaveBeenCalled();
  });

  it("PATCH rejects an empty body", async () => {
    expect((await request(app).patch("/settings").send({})).status).toBe(400);
  });

  it("PATCH passes the patch to the service", async () => {
    updateService.mockResolvedValue({ ok: true, message: "updated", data: {} });

    const res = await request(app).patch("/settings").send({ "stock:low": false });

    expect(res.status).toBe(200);
    expect(updateService).toHaveBeenCalledWith("seller-9", { "stock:low": false });
  });

  it("PATCH answers 500 when saving fails", async () => {
    updateService.mockResolvedValue({ ok: false, message: "Error updating notification settings" });

    expect((await request(app).patch("/settings").send({ "stock:low": false })).status).toBe(500);
  });
});
