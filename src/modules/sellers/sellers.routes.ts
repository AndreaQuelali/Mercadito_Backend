import { Router } from "express";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import {
  requiresActiveSeller,
  requiresSeller,
  userRoleValidation,
} from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";
import {
  createSeller,
  deleteMySeller,
  getMySeller,
  getNotificationSettings,
  getSellerSales,
  listSellers,
  updateMySeller,
  updateNotificationSettings,
  updateSellerStatus,
} from "./sellers.controller";

const sellerRouter = Router();

sellerRouter.post("/", validateSesionUser, createSeller);

sellerRouter.get("/mine", validateSesionUser, requiresSeller, getMySeller);

sellerRouter.patch("/mine", validateSesionUser, requiresSeller, updateMySeller);

sellerRouter.delete(
  "/mine",
  validateSesionUser,
  requiresActiveSeller,
  deleteMySeller
);

// Which seller notifications I receive (any Seller profile, active or suspended)
sellerRouter.get(
  "/notification-settings",
  validateSesionUser,
  requiresSeller,
  getNotificationSettings
);
sellerRouter.patch(
  "/notification-settings",
  validateSesionUser,
  requiresSeller,
  updateNotificationSettings
);

// Sales summary of my store (any Seller profile, active or suspended)
sellerRouter.get("/sales", validateSesionUser, requiresSeller, getSellerSales);

sellerRouter.get(
  "/",
  validateSesionUser,
  userRoleValidation(UserRole.admin),
  listSellers
);

sellerRouter.patch(
  "/:id/status",
  validateSesionUser,
  userRoleValidation(UserRole.admin),
  updateSellerStatus
);

export default sellerRouter;
