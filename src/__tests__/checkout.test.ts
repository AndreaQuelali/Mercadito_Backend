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
describe("checkoutService", () => {
  it("should fail checkout when cart is empty", async () => {
    db.$transaction.mockImplementation(async (fn: Function) => {
      const txMock = {
        cart: { findFirst: vi.fn().mockResolvedValue({ id: 10, items: [] }) },
        product: { findUnique: vi.fn(), update: vi.fn() },
        order: { create: vi.fn() },
        orderItem: { create: vi.fn() },
        cartItem: { deleteMany: vi.fn() },
      };
      return fn(txMock);
    });

    const result = await checkoutService(userId);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cart is empty/i);
  });

  it("should fail checkout when stock drops between add-to-cart and checkout (race condition)", async () => {
    db.$transaction.mockImplementation(async (fn: Function) => {
      const txMock = {
        cart: {
          findFirst: vi.fn().mockResolvedValue({
            id: 10,
            items: [{ id: 100, productId: 1, quantity: 3 }],
          }),
        },
        product: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, price: 10, stock: 2 }), // only 2 left
          update: vi.fn(),
        },
        order: { create: vi.fn() },
        orderItem: { create: vi.fn() },
        cartItem: { deleteMany: vi.fn() },
      };
      return fn(txMock);
    });

    const result = await checkoutService(userId);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
  });

  it("should create an order successfully when stock is available", async () => {
    db.$transaction.mockImplementation(async (fn: Function) => {
      const txMock = {
        cart: {
          findFirst: vi.fn().mockResolvedValue({
            id: 10,
            items: [{ id: 100, productId: 1, quantity: 2 }],
          }),
        },
        product: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, price: 50, stock: 10 }),
          update: vi.fn(),
        },
        order: { create: vi.fn().mockResolvedValue({ id: 42, userId, status: "pending", total: 100 }) },
        orderItem: { create: vi.fn() },
        cartItem: { deleteMany: vi.fn() },
      };
      return fn(txMock);
    });

    const result = await checkoutService(userId);
    expect(result.ok).toBe(true);
    expect((result as any).data?.id).toBe(42);
  });
});
