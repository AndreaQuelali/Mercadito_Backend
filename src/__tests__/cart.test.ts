import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    cart: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    cartItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    product: { findUnique: vi.fn() },
  },
}));

import {
  getCartService,
  addToCartService,
  removeCartItemService,
  updateCartItemService,
  clearCartService,
} from "../modules/carts/carts.service";
import prisma from "../config/prisma";

const db = prisma as any;
const userId = "user-1";
const cart = { id: 10, userId };

beforeEach(() => vi.resetAllMocks());

describe("getCartService", () => {
  it("returns an empty cart (ok) when the user has none", async () => {
    db.cart.findFirst.mockResolvedValue(null);

    const result = await getCartService(userId);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ items: [] });
  });

  it("returns the cart with its items", async () => {
    db.cart.findFirst.mockResolvedValue({ ...cart, items: [{ id: 1 }] });

    const result = await getCartService(userId);

    expect(result.ok).toBe(true);
    expect(result.data.items).toHaveLength(1);
  });

  it("returns ok=false when the database fails", async () => {
    db.cart.findFirst.mockRejectedValue(new Error("boom"));

    const result = await getCartService(userId);

    expect(result.ok).toBe(false);
  });
});

describe("addToCartService — validation and merging", () => {
  it("rejects quantity <= 0", async () => {
    const result = await addToCartService(userId, { productId: 1, quantity: 0 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/quantity/i);
    expect(db.product.findUnique).not.toHaveBeenCalled();
  });

  it("returns not found when the product does not exist", async () => {
    db.product.findUnique.mockResolvedValue(null);

    const result = await addToCartService(userId, { productId: 99, quantity: 1 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/product not found/i);
  });

  it("creates the cart when the user has none", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, stock: 5 });
    db.cart.findFirst.mockResolvedValue(null);
    db.cart.create.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue(null);
    db.cartItem.create.mockResolvedValue({ id: 1 });
    db.cart.findUnique.mockResolvedValue({ ...cart, items: [] });

    const result = await addToCartService(userId, { productId: 1, quantity: 1 });

    expect(result.ok).toBe(true);
    expect(db.cart.create).toHaveBeenCalledWith({ data: { userId } });
  });

  it("sums quantity when the product is already in the cart", async () => {
    db.product.findUnique.mockResolvedValue({ id: 1, stock: 10 });
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue({ id: 100, quantity: 2 });
    db.cartItem.update.mockResolvedValue({ id: 100, quantity: 5 });
    db.cart.findUnique.mockResolvedValue({ ...cart, items: [] });

    const result = await addToCartService(userId, { productId: 1, quantity: 3 });

    expect(result.ok).toBe(true);
    expect(db.cartItem.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { quantity: 5 },
    });
    expect(db.cartItem.create).not.toHaveBeenCalled();
  });
});

describe("removeCartItemService", () => {
  it("returns not found when the user has no cart", async () => {
    db.cart.findFirst.mockResolvedValue(null);

    const result = await removeCartItemService(userId, 1);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cart not found/i);
  });

  it("refuses to remove an item that is not in the user's cart", async () => {
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue(null);

    const result = await removeCartItemService(userId, 77);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/item not found/i);
    expect(db.cartItem.delete).not.toHaveBeenCalled();
    expect(db.cartItem.findFirst).toHaveBeenCalledWith({
      where: { id: 77, cartId: cart.id },
    });
  });

  it("removes the item and returns the updated cart", async () => {
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue({ id: 1 });
    db.cart.findUnique.mockResolvedValue({ ...cart, items: [] });

    const result = await removeCartItemService(userId, 1);

    expect(result.ok).toBe(true);
    expect(db.cartItem.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe("updateCartItemService", () => {
  it("returns not found when the user has no cart", async () => {
    db.cart.findFirst.mockResolvedValue(null);

    const result = await updateCartItemService(userId, 1, 2);

    expect(result.ok).toBe(false);
  });

  it("returns not found when the item is not in the cart", async () => {
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue(null);

    const result = await updateCartItemService(userId, 1, 2);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/item not found/i);
  });

  it("rejects a quantity above the available stock", async () => {
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue({ id: 1, product: { stock: 3 } });

    const result = await updateCartItemService(userId, 1, 5);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/insufficient stock/i);
    expect(db.cartItem.update).not.toHaveBeenCalled();
  });

  it("updates the quantity when stock allows it", async () => {
    db.cart.findFirst.mockResolvedValue(cart);
    db.cartItem.findFirst.mockResolvedValue({ id: 1, product: { stock: 10 } });
    db.cart.findUnique.mockResolvedValue({ ...cart, items: [] });

    const result = await updateCartItemService(userId, 1, 4);

    expect(result.ok).toBe(true);
    expect(db.cartItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { quantity: 4 },
    });
  });
});

describe("clearCartService", () => {
  it("returns not found when the user has no cart", async () => {
    db.cart.findFirst.mockResolvedValue(null);

    const result = await clearCartService(userId);

    expect(result.ok).toBe(false);
  });

  it("deletes every item of the user's cart", async () => {
    db.cart.findFirst.mockResolvedValue(cart);

    const result = await clearCartService(userId);

    expect(result.ok).toBe(true);
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: cart.id },
    });
  });
});
