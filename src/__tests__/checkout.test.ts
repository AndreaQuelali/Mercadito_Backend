import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — define all vi.fn() calls inside the factory
vi.mock("../config/prisma", () => ({
  default: {
    cart: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    cartItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    order: { create: vi.fn() },
    orderItem: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  prisma: { $connect: vi.fn() },
}));

import { checkoutService, addToCartService } from "../modules/carts/carts.service";
import { CheckoutSchema } from "../modules/carts/schemas/checkout.schema";
import prisma from "../config/prisma";

const db = prisma as any;
const userId = "user-uuid-1";

beforeEach(() => vi.clearAllMocks());

// ── addToCartService — stock validation ───────────────────────────────────────
describe("addToCartService — stock validation", () => {
  it("should reject adding to cart when stock is insufficient", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, stock: 2 });
    db.cart.findFirst.mockResolvedValue({ id: 10, userId });

    const result = await addToCartService(userId, { productId: 1, quantity: 5 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
  });

  it("should reject if adding more than available stock to existing cart item", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, stock: 3 });
    db.cart.findFirst.mockResolvedValue({ id: 10, userId });
    db.cartItem.findFirst.mockResolvedValue({ id: 100, quantity: 2, productId: 1 });

    // 2 already in cart + 2 more = 4, but stock is only 3
    const result = await addToCartService(userId, { productId: 1, quantity: 2 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
  });

  it("should add to cart successfully when stock is sufficient", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, stock: 10, name: "Tomate" });
    db.cart.findFirst.mockResolvedValue({ id: 10, userId });
    db.cartItem.findFirst.mockResolvedValue(null);
    db.cartItem.create.mockResolvedValue({ id: 101, cartId: 10, productId: 1, quantity: 3 });
    db.cart.findUnique.mockResolvedValue({
      id: 10,
      items: [{ id: 101, productId: 1, quantity: 3, product: { id: 1, name: "Tomate" } }],
    });

    const result = await addToCartService(userId, { productId: 1, quantity: 3 });

    expect(result.ok).toBe(true);
    expect(db.cartItem.create).toHaveBeenCalledOnce();
  });
});

// ── checkoutService ───────────────────────────────────────────────────────────
type TxOpts = { items: { productId: number; quantity: number }[]; products: Record<number, any> };

/** Transaction mock that records what checkout creates, so the tests can assert the effects. */
function mockCheckoutTx({ items, products }: TxOpts) {
  const created = { orders: [] as any[], orderItems: [] as any[], stockUpdates: [] as any[], cartCleared: false };
  let nextOrderId = 100;
  const tx = {
    cart: { findFirst: vi.fn().mockResolvedValue({ id: 10, items }) },
    user: {
      findUnique: vi.fn().mockResolvedValue({ phoneCountryCode: "+591", phoneNumber: "70012345" }),
    },
    product: {
      findUnique: vi.fn(async ({ where }: any) => products[where.id] ?? null),
      update: vi.fn(async (args: any) => void created.stockUpdates.push(args)),
    },
    order: {
      create: vi.fn(async ({ data }: any) => {
        const order = { id: nextOrderId++, ...data };
        created.orders.push(order);
        return order;
      }),
    },
    orderItem: { create: vi.fn(async ({ data }: any) => void created.orderItems.push(data)) },
    cartItem: { deleteMany: vi.fn(async () => void (created.cartCleared = true)) },
  };
  db.$transaction.mockImplementation(async (fn: Function) => fn(tx));
  return created;
}

const product = (id: number, sellerId: string, stock = 10, price = 50) => ({
  id,
  name: `Product ${id}`,
  price,
  stock,
  sellerId,
  seller: { userId: `user-of-${sellerId}` },
});

describe("checkoutService", () => {
  it("should fail checkout when cart is empty", async () => {
    mockCheckoutTx({ items: [], products: {} });

    const result = await checkoutService(userId, { fulfillment: "pickup" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cart is empty/i);
  });

  it("should fail checkout when stock drops between add-to-cart and checkout (race condition)", async () => {
    const created = mockCheckoutTx({
      items: [{ productId: 1, quantity: 3 }],
      products: { 1: product(1, "s1", 2) }, // only 2 left
    });

    const result = await checkoutService(userId, { fulfillment: "pickup" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
    expect(created.orders).toHaveLength(0);
  });

  it("creates one order for a one-stand cart, with the delivery data", async () => {
    const created = mockCheckoutTx({
      items: [{ productId: 1, quantity: 2 }],
      products: { 1: product(1, "s1") },
    });

    const result = await checkoutService(userId, {
      fulfillment: "delivery",
      address: "Calle 1 #20",
      addressRef: "Puerta verde",
      contactPhone: "+591 79999999",
      note: "Tocar timbre",
    });

    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.orders).toHaveLength(1);
    expect(data.checkoutId).toBe(created.orders[0].checkoutId);
    expect(created.orders[0]).toMatchObject({
      userId,
      sellerId: "s1",
      total: 100,
      status: "pending",
      fulfillment: "delivery",
      address: "Calle 1 #20",
      addressRef: "Puerta verde",
      contactPhone: "+591 79999999",
      note: "Tocar timbre",
    });
    expect(created.stockUpdates).toEqual([{ where: { id: 1 }, data: { stock: 8 } }]);
    expect(created.cartCleared).toBe(true);
  });

  it("splits a two-stand cart into two orders that share the checkoutId", async () => {
    const created = mockCheckoutTx({
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
        { productId: 3, quantity: 3 },
      ],
      products: { 1: product(1, "s1", 10, 50), 2: product(2, "s2", 10, 30), 3: product(3, "s1", 10, 10) },
    });

    const result = await checkoutService(userId, { fulfillment: "pickup" });

    expect(result.ok).toBe(true);
    expect(created.orders).toHaveLength(2);
    const [a, b] = created.orders;
    expect(a.checkoutId).toBe(b.checkoutId);
    expect(a).toMatchObject({ sellerId: "s1", total: 130 }); // 2*50 + 3*10
    expect(b).toMatchObject({ sellerId: "s2", total: 30 });
    expect(created.orderItems.filter((i) => i.orderId === a.id).map((i) => i.productId)).toEqual([1, 3]);
    expect(created.orderItems.filter((i) => i.orderId === b.id).map((i) => i.productId)).toEqual([2]);
    expect(created.stockUpdates).toHaveLength(3);
  });

  it("creates nothing and discounts nothing when a product of the second stand lacks stock", async () => {
    const created = mockCheckoutTx({
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 5 },
      ],
      products: { 1: product(1, "s1"), 2: product(2, "s2", 2) },
    });

    const result = await checkoutService(userId, { fulfillment: "pickup" });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
    expect(created.orders).toHaveLength(0);
    expect(created.orderItems).toHaveLength(0);
    expect(created.stockUpdates).toHaveLength(0);
    expect(created.cartCleared).toBe(false);
  });

  it("pickup defaults the contact phone to the buyer profile and stores no address", async () => {
    const created = mockCheckoutTx({
      items: [{ productId: 1, quantity: 1 }],
      products: { 1: product(1, "s1") },
    });

    await checkoutService(userId, { fulfillment: "pickup" });

    expect(created.orders[0]).toMatchObject({
      fulfillment: "pickup",
      address: null,
      addressRef: null,
      contactPhone: "+591 70012345",
      note: null,
    });
  });
});

describe("CheckoutSchema", () => {
  const parse = (body: unknown) => CheckoutSchema.safeParse(body);

  it("accepts pickup without address or reference", () => {
    expect(parse({ fulfillment: "pickup" }).success).toBe(true);
  });

  it("drops the address of a pickup purchase", () => {
    const r = parse({ fulfillment: "pickup", address: "Calle 1", addressRef: "x" });
    expect(r.success && r.data.address).toBeUndefined();
  });

  it("rejects delivery without address", () => {
    expect(parse({ fulfillment: "delivery", addressRef: "Puerta verde" }).success).toBe(false);
  });

  it("rejects delivery without reference", () => {
    expect(parse({ fulfillment: "delivery", address: "Calle 1" }).success).toBe(false);
  });

  it("rejects blank address on delivery", () => {
    expect(parse({ fulfillment: "delivery", address: "   ", addressRef: "x" }).success).toBe(false);
  });

  it("rejects an unknown method and a missing body", () => {
    expect(parse({ fulfillment: "drone" }).success).toBe(false);
    expect(parse({}).success).toBe(false);
  });

  it("rejects a note over 300 characters", () => {
    expect(parse({ fulfillment: "pickup", note: "x".repeat(301) }).success).toBe(false);
    expect(parse({ fulfillment: "pickup", note: "x".repeat(300) }).success).toBe(true);
  });
});
