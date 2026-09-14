import { Router } from "express";
import {
  addToCart,
  checkout,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./carts.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";

const cartRouter = Router();

cartRouter.use(validateSesionUser);

cartRouter.get("/", getCart);
cartRouter.post("/add", addToCart);
cartRouter.post("/checkout", checkout);
cartRouter.delete("/", clearCart);
cartRouter.delete("/item/:itemId", removeCartItem);
cartRouter.patch("/item/:itemId", updateCartItem);

export default cartRouter;
