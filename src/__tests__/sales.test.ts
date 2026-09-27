import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../config/prisma", () => ({
  default: {
    orderItem: { findMany: vi.fn() },
  },
}));

import { getSellerSalesService } from "../modules/sellers/sellers.service";
import { SalesQuerySchema } from "../modules/sellers/schemas/sales.schema";
import prisma from "../config/prisma";

const db = prisma as any;

beforeEach(() => vi.resetAllMocks());

const line = (over: Partial<any> = {}) => ({
  productId: 1,
  quantity: 2,
  price: "10.50",
  product: { name: "Tomate" },
  order: { id: 100, status: "delivered" },
  ...over,
});

describe("getSellerSalesService", () => {
  it("only reads the seller's own items", async () => {
    db.orderItem.findMany.mockResolvedValue([]);

    await getSellerSalesService("seller-1", {});

    expect(db.orderItem.findMany.mock.calls[0][0].where).toEqual({
      product: { sellerId: "seller-1" },
    });
  });

  it("filters by the creation date of the order when a range is given", async () => {
    db.orderItem.findMany.mockResolvedValue([]);
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-31T23:59:59.999Z");

    await getSellerSalesService("seller-1", { from, to });

    expect(db.orderItem.findMany.mock.calls[0][0].where).toEqual({
      product: { sellerId: "seller-1" },
      order: { createdAt: { gte: from, lte: to } },
    });
  });

  it("supports an open-ended range", async () => {
    db.orderItem.findMany.mockResolvedValue([]);
    const from = new Date("2026-01-01T00:00:00Z");

    await getSellerSalesService("seller-1", { from });

    expect(db.orderItem.findMany.mock.calls[0][0].where.order).toEqual({ createdAt: { gte: from } });
  });

  it("returns zeros and every status for a seller without sales", async () => {
    db.orderItem.findMany.mockResolvedValue([]);

    const result = await getSellerSalesService("seller-1", {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      range: { from: null, to: null },
      total: "0.00",
      ordersCount: 0,
      unitsSold: 0,
      ordersByStatus: { pending: 0, paid: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 },
      topProducts: [],
    });
  });

  it("echoes the range as ISO strings", async () => {
    db.orderItem.findMany.mockResolvedValue([]);

    const result = await getSellerSalesService("s", {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-31T23:59:59.999Z"),
    });

    expect(result.data.range).toEqual({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.999Z",
    });
  });

  it("sums revenue of paid, confirmed, shipped and delivered orders only", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ order: { id: 1, status: "pending" }, quantity: 5 }),
      line({ order: { id: 2, status: "cancelled" }, quantity: 5 }),
      line({ order: { id: 3, status: "paid" }, quantity: 1 }),
      line({ order: { id: 4, status: "confirmed" }, quantity: 1 }),
      line({ order: { id: 5, status: "shipped" }, quantity: 1 }),
      line({ order: { id: 6, status: "delivered" }, quantity: 1 }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.total).toBe("42.00"); // 4 units x 10.50
    expect(result.data.unitsSold).toBe(4);
    expect(result.data.ordersCount).toBe(4);
  });

  it("counts an order once even when it has several of the seller's products", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ productId: 1, order: { id: 7, status: "delivered" } }),
      line({ productId: 2, product: { name: "Pan" }, order: { id: 7, status: "delivered" } }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.ordersCount).toBe(1);
    expect(result.data.ordersByStatus.delivered).toBe(1);
  });

  it("groups orders by status, including the ones that are not revenue", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ order: { id: 1, status: "pending" } }),
      line({ order: { id: 2, status: "pending" } }),
      line({ order: { id: 3, status: "cancelled" } }),
      line({ order: { id: 4, status: "shipped" } }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.ordersByStatus).toEqual({
      pending: 2,
      paid: 0,
      confirmed: 0,
      shipped: 1,
      delivered: 0,
      cancelled: 1,
    });
  });

  it("does not accumulate floating point errors (cent precision)", async () => {
    db.orderItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) =>
        line({ price: "0.10", quantity: 1, order: { id: i + 1, status: "delivered" } })
      )
    );

    const result = await getSellerSalesService("s", {});

    expect(result.data.total).toBe("1.00");
  });

  it("accepts Prisma Decimal-like prices", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ price: { toString: () => "3.25" }, quantity: 4 }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.total).toBe("13.00");
  });

  it("ranks the top products by units sold and limits them to 5", async () => {
    const items = [1, 2, 3, 4, 5, 6].flatMap((id) =>
      line({
        productId: id,
        quantity: id, // product 6 sells the most
        price: "1.00",
        product: { name: `P${id}` },
        order: { id: 1000 + id, status: "delivered" },
      })
    );
    db.orderItem.findMany.mockResolvedValue(items);

    const result = await getSellerSalesService("s", {});

    expect(result.data.topProducts.map((p: any) => p.productId)).toEqual([6, 5, 4, 3, 2]);
    expect(result.data.topProducts[0]).toEqual({
      productId: 6,
      name: "P6",
      units: 6,
      revenue: "6.00",
    });
  });

  it("merges the lines of one product across orders and breaks ties by revenue", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ productId: 1, quantity: 2, price: "1.00", product: { name: "Barato" }, order: { id: 1, status: "delivered" } }),
      line({ productId: 1, quantity: 1, price: "1.00", product: { name: "Barato" }, order: { id: 2, status: "delivered" } }),
      line({ productId: 2, quantity: 3, price: "9.00", product: { name: "Caro" }, order: { id: 3, status: "delivered" } }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.topProducts).toEqual([
      { productId: 2, name: "Caro", units: 3, revenue: "27.00" },
      { productId: 1, name: "Barato", units: 3, revenue: "3.00" },
    ]);
  });

  it("leaves non-revenue orders out of the top products", async () => {
    db.orderItem.findMany.mockResolvedValue([
      line({ productId: 1, order: { id: 1, status: "cancelled" } }),
    ]);

    const result = await getSellerSalesService("s", {});

    expect(result.data.topProducts).toEqual([]);
  });

  it("returns ok=false when the database fails", async () => {
    db.orderItem.findMany.mockRejectedValue(new Error("boom"));

    const result = await getSellerSalesService("s", {});

    expect(result.ok).toBe(false);
  });
});

describe("SalesQuerySchema", () => {
  it("accepts no filters", () => {
    expect(SalesQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts plain dates and ISO datetimes", () => {
    expect(SalesQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-31" }).success).toBe(true);
    expect(
      SalesQuerySchema.safeParse({ from: "2026-01-01T04:00:00.000Z", to: "2026-01-31T03:59:59.999Z" }).success
    ).toBe(true);
  });

  it("rejects values that are not dates", () => {
    expect(SalesQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
    expect(SalesQuerySchema.safeParse({ to: "2026-13-45" }).success).toBe(false);
  });
});

describe("GET /seller/sales controller", () => {
  const service = vi.fn();
  let app: express.Express;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../modules/sellers/sellers.service", () => ({
      createSellerService: vi.fn(),
      deleteMySellerService: vi.fn(),
      getMySellerService: vi.fn(),
      listSellersService: vi.fn(),
      updateMySellerService: vi.fn(),
      updateSellerStatusService: vi.fn(),
      getSellerSalesService: service,
    }));
    const { getSellerSales } = await import("../modules/sellers/sellers.controller");
    app = express();
    app.get("/sales", (req, _res, next) => {
      req.user = { sub: "u1", sellerId: "seller-9" };
      next();
    }, getSellerSales);
    service.mockReset();
  });

  it("passes the seller of the session and the parsed range to the service", async () => {
    service.mockResolvedValue({ ok: true, message: "Sales summary", data: { total: "0.00" } });

    const res = await request(app).get("/sales?from=2026-01-01&to=2026-01-31");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: "0.00" });
    const [sellerId, range] = service.mock.calls[0];
    expect(sellerId).toBe("seller-9");
    expect(range.from).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    // a plain end date includes the whole day
    expect(range.to).toEqual(new Date("2026-01-31T23:59:59.999Z"));
  });

  it("uses datetimes as they come", async () => {
    service.mockResolvedValue({ ok: true, message: "ok", data: {} });

    await request(app).get("/sales?from=2026-01-01T04:00:00.000Z&to=2026-02-01T03:59:59.999Z");

    const range = service.mock.calls[0][1];
    expect(range.from).toEqual(new Date("2026-01-01T04:00:00.000Z"));
    expect(range.to).toEqual(new Date("2026-02-01T03:59:59.999Z"));
  });

  it("answers 400 for an invalid date", async () => {
    const res = await request(app).get("/sales?from=nope");

    expect(res.status).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });

  it("answers 400 when the range is reversed", async () => {
    const res = await request(app).get("/sales?from=2026-02-01&to=2026-01-01");

    expect(res.status).toBe(400);
    expect(service).not.toHaveBeenCalled();
  });

  it("answers 500 when the service fails", async () => {
    service.mockResolvedValue({ ok: false, message: "Error fetching sales" });

    const res = await request(app).get("/sales");

    expect(res.status).toBe(500);
  });
});
