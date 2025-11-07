import { Router } from "express";
import { getOrderById, listMyOrders, updateOrderStatus } from "./orders.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { userRoleValidation } from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";

const orderRouter = Router();

orderRouter.use(validateSesionUser);
orderRouter.get("/", listMyOrders);
orderRouter.get("/:id", listMyOrders, getOrderById);
orderRouter.patch(
  "/:id/status",
  userRoleValidation(UserRole.seller, UserRole.admin),
  updateOrderStatus
);

export default orderRouter;
