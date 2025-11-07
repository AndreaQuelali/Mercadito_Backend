import { Request, Response } from "express";
import { createReviewService, listProductReviewsService } from "./reviews.service";
import { ICreateReviewDto } from "./dtos/createReview.dto";

export const createReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const payload = req.body as ICreateReviewDto;
    const result = await createReviewService(userId, payload);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(201).send({ message: result.message, ok: true, status: 201, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error creating review", ok: false, status: 500 });
  }
};

export const listProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    const result = await listProductReviewsService(productId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching reviews", ok: false, status: 500 });
  }
};
