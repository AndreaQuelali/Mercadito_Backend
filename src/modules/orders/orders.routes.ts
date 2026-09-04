import { Router } from "express";
import {
  getOrderById,
  listMyOrders,
  listSellerOrders,
  updateOrderStatus,
} from "./orders.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { userRoleValidation } from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";

const orderRouter = Router();

orderRouter.use(validateSesionUser);

// Any authenticated user — their own orders
orderRouter.get("/", listMyOrders);

// Seller — orders that contain their products (must be BEFORE /:id)
orderRouter.get(
  "/seller/mine",
  userRoleValidation(UserRole.seller),
  listSellerOrders
);

orderRouter.get("/:id", getOrderById);

// Seller or Admin — update order status
orderRouter.patch(
  "/:id/status",
  userRoleValidation(UserRole.seller, UserRole.admin),
  updateOrderStatus
);

export default orderRouter;
