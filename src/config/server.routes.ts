import { Router, Request, Response } from "express";
import healthRouter from "../modules/healthCheck/healthCheck.routes";
import productRouter from "../modules/products/products.routes";
import userRouter from "../modules/users/users.routes";
import authRouter from "../modules/auth/auth.routes";
import cartRouter from "../modules/carts/carts.routes";
import orderRouter from "../modules/orders/orders.routes";
import reviewRouter from "../modules/reviews/reviews.routes";
import sellerRouter from "../modules/sellers/sellers.routes";
import notificationRouter from "../modules/notifications/notifications.routes";
import { createDocsRouter } from "../docs/docs.router";
import { ENV } from "./env.config";

/** Every module router with its mount path. Also read by the OpenAPI route-coverage test. */
export const routeMounts: [string, Router][] = [
  ["/", healthRouter],
  ["/product", productRouter],
  ["/user", userRouter],
  ["/auth", authRouter],
  ["/cart", cartRouter],
  ["/order", orderRouter],
  ["/review", reviewRouter],
  ["/seller", sellerRouter],
  ["/notification", notificationRouter],
];

const router = Router();

// Before the 404 catch-all
router.use(createDocsRouter(ENV.ENABLE_DOCS));

for (const [prefix, moduleRouter] of routeMounts) {
  router.use(prefix, moduleRouter);
}

router.use((req: Request, res: Response) => {
  res.status(404).send({ message: "Not Found", status: 404, ok: false });
});

export default router;
