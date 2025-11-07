import { Router } from "express";
import { createReview, listProductReviews } from "./reviews.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";

const reviewRouter = Router();

reviewRouter.get("/product/:productId", listProductReviews);
reviewRouter.post("/", validateSesionUser, createReview);

export default reviewRouter;
