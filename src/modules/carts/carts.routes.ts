import { Router } from "express";
import { addToCart, checkout, getCart } from "./carts.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";

const cartRouter = Router();

cartRouter.use(validateSesionUser);
cartRouter.get("/", getCart);
cartRouter.post("/add", addToCart);
cartRouter.post("/checkout", checkout);

export default cartRouter;
