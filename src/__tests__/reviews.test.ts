import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  default: {
    orderItem: { findFirst: vi.fn() },
    review: { create: vi.fn(), findMany: vi.fn() },
  },
  prisma: { $connect: vi.fn() },
}));

import { createReviewService } from "../modules/reviews/reviews.service";
import prisma from "../config/prisma";

const db = prisma as any;
const userId = "user-uuid-1";
const reviewPayload = { productId: 5, rating: 4, comment: "Great product!" };

const deliveredOrderItem = {
  id: 1,
  productId: 5,
  order: { id: 10, userId, status: "delivered" },
};

beforeEach(() => vi.clearAllMocks());

describe("createReviewService", () => {
  it("should create a review when the order has been delivered", async () => {
    db.orderItem.findFirst.mockResolvedValue(deliveredOrderItem);
    db.review.create.mockResolvedValue({
      id: 99,
      userId,
      productId: 5,
      rating: 4,
      comment: "Great product!",
    });

    const result = await createReviewService(userId, reviewPayload);

    expect(result.ok).toBe(true);
    expect((result as any).data?.id).toBe(99);
    expect(db.review.create).toHaveBeenCalledOnce();
  });

  it("should reject review when order has not been delivered", async () => {
    db.orderItem.findFirst.mockResolvedValue(null); // no delivered order found

    const result = await createReviewService(userId, reviewPayload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/delivered/i);
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it("should reject review when user has never purchased the product", async () => {
    db.orderItem.findFirst.mockResolvedValue(null);

    const result = await createReviewService(userId, { ...reviewPayload, productId: 999 });

    expect(result.ok).toBe(false);
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it("should reject duplicate review (P2002 unique constraint)", async () => {
    db.orderItem.findFirst.mockResolvedValue(deliveredOrderItem);
    db.review.create.mockRejectedValue({ code: "P2002" });

    const result = await createReviewService(userId, reviewPayload);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already reviewed/i);
  });

  it("should reject a rating above 5", async () => {
    const result = await createReviewService(userId, { ...reviewPayload, rating: 6 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rating/i);
    expect(db.orderItem.findFirst).not.toHaveBeenCalled();
  });

  it("should reject a rating of 0", async () => {
    const result = await createReviewService(userId, { ...reviewPayload, rating: 0 });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rating/i);
  });
});
