import { Request, Response } from "express";
import { createReviewService, listProductReviewsService } from "./reviews.service";
import { CreateReviewSchema } from "./schemas/createReview.schema";
import { ENV } from "../../config/env.config";

export const createReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;

    const { success, data, error } = CreateReviewSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await createReviewService(userId, data);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(201).send({ message: result.message, ok: true, status: 201, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error creating review", ok: false, status: 500 });
  }
};

export const listProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    if (Number.isNaN(productId)) {
      return res.status(400).send({ message: "Invalid product id", ok: false, status: 400 });
    }
    const result = await listProductReviewsService(productId);
    if (!result.ok) return res.status(500).send({ message: result.message, ok: false, status: 500 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching reviews", ok: false, status: 500 });
  }
};
