import { Router, Request, Response } from "express";
import healthRouter from "../modules/healthCheck/healthCheck.routes";
import productRouter from "../modules/products/products.routes";
import userRouter from "../modules/users/users.routes";
import authRouter from "../modules/auth/auth.routes";
import cartRouter from "../modules/carts/carts.routes";
import orderRouter from "../modules/orders/orders.routes";
import reviewRouter from "../modules/reviews/reviews.routes";

const router = Router();

router.use("/", healthRouter);
router.use("/product", productRouter);
router.use("/user", userRouter);
router.use("/auth", authRouter);
router.use("/cart", cartRouter);
router.use("/order", orderRouter);
router.use("/review", reviewRouter);

router.use((req: Request, res: Response) => {
  res.status(404).send({ message: "Not Found", status: 404, ok: false });
});

export default router;
