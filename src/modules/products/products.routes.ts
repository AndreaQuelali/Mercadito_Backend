import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  readProduct,
  updateProduct,
  listSellerProducts,
} from "./products.controller";
import { searchProducts } from "../search/search.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import {
  requiresActiveSeller,
  requiresSeller,
} from "../../middleware/userRole.middleware";

const productRouter = Router();

// Public — list all products with optional filters
productRouter.get("/", readProduct);

// Authenticated — hybrid (vector + text) catalog search; before /:id so "search" is not read as an id
productRouter.get("/search", validateSesionUser, searchProducts);

// Seller — list their own products (must come before /:id)
productRouter.get(
  "/mine",
  validateSesionUser,
  requiresSeller,
  listSellerProducts
);

// Public — get a single product by id
productRouter.get("/:id", getProductById);

// Seller — create product
productRouter.post(
  "/",
  validateSesionUser,
  requiresActiveSeller,
  createProduct
);

// Seller — update own product
productRouter.put(
  "/:id",
  validateSesionUser,
  requiresActiveSeller,
  updateProduct
);

// Seller — delete own product
productRouter.delete(
  "/:id",
  validateSesionUser,
  requiresActiveSeller,
  deleteProduct
);

export default productRouter;
