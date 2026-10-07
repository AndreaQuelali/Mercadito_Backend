import { Router } from "express";
import {
  cancelOrder,
  getOrderById,
  listMyOrders,
  listSellerOrders,
  updateOrderStatus,
  updatePayment,
  uploadPaymentProof,
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

// Buyer (owner of the order) — cancel while the seller has not confirmed it
orderRouter.post("/:id/cancel", cancelOrder);

// Buyer (owner of the order) — attach the payment proof
orderRouter.post("/:id/payment-proof", uploadPaymentProof);

// Active seller (owner of the order) or Admin — confirm or reject the payment
orderRouter.patch("/:id/payment", requireAdminOrActiveSeller, updatePayment);

export default orderRouter;
