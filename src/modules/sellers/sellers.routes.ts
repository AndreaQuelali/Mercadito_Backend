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
  getSellerSales,
  listSellers,
  updateMySeller,
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
