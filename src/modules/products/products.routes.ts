import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  readProduct,
  updateProduct,
  listSellerProducts,
} from "./products.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { userRoleValidation } from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";

const productRouter = Router();

// Public — list all products with optional filters
productRouter.get("/", readProduct);

// Seller — list their own products (must come before /:id)
productRouter.get(
  "/mine",
  validateSesionUser,
  userRoleValidation(UserRole.seller),
  listSellerProducts
);

// Public — get a single product by id
productRouter.get("/:id", getProductById);

// Seller — create product
productRouter.post(
  "/",
  validateSesionUser,
  userRoleValidation(UserRole.seller),
  createProduct
);

// Seller — update own product
productRouter.put(
  "/:id",
  validateSesionUser,
  userRoleValidation(UserRole.seller),
  updateProduct
);

// Seller — delete own product
productRouter.delete(
  "/:id",
  validateSesionUser,
  userRoleValidation(UserRole.seller),
  deleteProduct
);

export default productRouter;
