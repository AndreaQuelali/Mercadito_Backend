import router from "express";
import { createProduct, deleteProduct, readProduct, updateProduct } from "./products.controller";

const productRouter = router();

//CRUD
//Create
productRouter.post("/", createProduct)
//Read
productRouter.get("/", readProduct)
//Update
productRouter.put("/:id", updateProduct)
//Delete
productRouter.delete("/:id", deleteProduct)

export default productRouter
