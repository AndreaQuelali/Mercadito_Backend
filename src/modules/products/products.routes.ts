import { Router } from "express";
import { createProduct, deleteProduct, readProduct, updateProduct, listSellerProducts } from "./products.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { userRoleValidation } from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";

const productRouter = Router();

//CRUD
//Create
productRouter.post("/", validateSesionUser, userRoleValidation(UserRole.seller), createProduct)
//Read client
productRouter.get("/", readProduct)
//Read seller
productRouter.get("/mine", validateSesionUser, userRoleValidation(UserRole.seller), listSellerProducts)
//Update
productRouter.put("/:id", validateSesionUser, userRoleValidation(UserRole.seller), updateProduct)
//Delete
productRouter.delete("/:id", validateSesionUser, userRoleValidation(UserRole.seller), deleteProduct)

export default productRouter
