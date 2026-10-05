import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    orderItem: { findFirst: vi.fn() },
    review: { create: vi.fn() },
  },
}));
vi.mock("../tools/notify.tool", () => ({
  notifyOrderCreated: vi.fn(),
  notifyNewReview: vi.fn(),
}));

import { checkoutService } from "../modules/carts/carts.service";
import { createReviewService } from "../modules/reviews/reviews.service";
import { notifyOrderCreated, notifyNewReview } from "../tools/notify.tool";
import prisma from "../config/prisma";

const db = prisma as any;
const userId = "buyer-1";

beforeEach(() => vi.resetAllMocks());

function mockTx(product: any, cartItems: any[]) {
  db.$transaction.mockImplementation(async (fn: Function) =>
    fn({
      cart: { findFirst: vi.fn().mockResolvedValue({ id: 10, items: cartItems }) },
      product: { findUnique: vi.fn().mockResolvedValue(product), update: vi.fn() },
      user: { findUnique: vi.fn().mockResolvedValue({ phoneCountryCode: "+591", phoneNumber: "7000" }) },
      order: { create: vi.fn().mockResolvedValue({ id: 42, userId }) },
      orderItem: { create: vi.fn() },
      cartItem: { deleteMany: vi.fn() },
    })
  );
}

describe("checkoutService → notifications", () => {
  it("notifies sellers with the stock left after the sale", async () => {
    mockTx(
      { id: 1, name: "Tomate", price: 10, stock: 6, sellerId: "s1", seller: { userId: "seller-u1" } },
      [{ id: 100, productId: 1, quantity: 2 }]
    );

    const result = await checkoutService(userId, { fulfillment: "delivery", address: "Calle 1", addressRef: "Puerta verde" });

    expect(result.ok).toBe(true);
    expect(notifyOrderCreated).toHaveBeenCalledWith(
      42,
      [{ sellerUserId: "seller-u1", productId: 1, name: "Tomate", quantity: 2, stock: 4 }],
      "delivery"
    );
  });

  it("does not notify when checkout fails", async () => {
    mockTx({ id: 1, price: 10, stock: 1 }, [{ id: 100, productId: 1, quantity: 5 }]);

    const result = await checkoutService(userId, { fulfillment: "pickup" });

    expect(result.ok).toBe(false);
    expect(notifyOrderCreated).not.toHaveBeenCalled();
  });

  it("does not fail the checkout when notifying throws", async () => {
    mockTx(
      { id: 1, name: "Tomate", price: 10, stock: 6, sellerId: "s1", seller: { userId: "s" } },
      [{ id: 100, productId: 1, quantity: 1 }]
    );
    (notifyOrderCreated as any).mockRejectedValue(new Error("socket down"));

    const result = await checkoutService(userId, { fulfillment: "pickup" });

    expect(result.ok).toBe(true);
  });
});

describe("createReviewService → notifications", () => {
  const payload = { productId: 5, rating: 4, comment: "ok" };

  it("notifies the seller after the review is created", async () => {
    db.orderItem.findFirst.mockResolvedValue({ id: 1 });
    db.review.create.mockResolvedValue({ id: 9 });

    const result = await createReviewService(userId, payload);

    expect(result.ok).toBe(true);
    expect(notifyNewReview).toHaveBeenCalledWith(5, 4);
  });

  it("does not notify when the review is rejected", async () => {
    db.orderItem.findFirst.mockResolvedValue(null);

    const result = await createReviewService(userId, payload);

    expect(result.ok).toBe(false);
    expect(notifyNewReview).not.toHaveBeenCalled();
  });
});
