import { Router } from "express";
import {
  getOrderById,
  listMyOrders,
  listSellerOrders,
  updateOrderStatus,
} from "./orders.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import {
  requireAdminOrActiveSeller,
  requiresSeller,
} from "../../middleware/userRole.middleware";

const orderRouter = Router();

orderRouter.use(validateSesionUser);

// Any authenticated user — their own orders
orderRouter.get("/", listMyOrders);

// Seller — orders that contain their products (must be BEFORE /:id)
orderRouter.get("/seller/mine", requiresSeller, listSellerOrders);

orderRouter.get("/:id", getOrderById);

// Active seller or Admin — update order status
orderRouter.patch(
  "/:id/status",
  requireAdminOrActiveSeller,
  updateOrderStatus
);

export default orderRouter;
