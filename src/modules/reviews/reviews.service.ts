import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { ICreateReviewDto } from "./dtos/createReview.dto";

export async function createReviewService(
  userId: string,
  payload: ICreateReviewDto
): Promise<IServiceResponse<any>> {
  try {
    const { productId, rating, comment } = payload;
    if (rating < 1 || rating > 5)
      return { ok: false, message: "Rating must be between 1 and 5" };

    // Only allow reviews when the order has been delivered
    const deliveredOrder = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: { userId, status: "delivered" },
      },
      include: { order: true },
    });

    if (!deliveredOrder) {
      return {
        ok: false,
        message: "You can only review a product after your order has been delivered",
      };
    }

    const review = await prisma.review.create({
      data: { userId, productId, rating, comment },
    });

    return { ok: true, message: "Review created", data: review };
  } catch (error: any) {
    if (error?.code === "P2002")
      return { ok: false, message: "You already reviewed this product" };
    return { ok: false, message: "Error creating review" };
  }
}

export async function listProductReviewsService(
  productId: number
): Promise<IServiceResponse<any[]>> {
  try {
    const reviews = await prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { ok: true, message: "Reviews fetched", data: reviews };
  } catch (error) {
    return { ok: false, message: "Error fetching reviews" };
  }
}
