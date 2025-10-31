import router from "express";
import { createProduct, deleteProduct, readProduct, updateProduct } from "./products.controller";

const productRouter = router();

//CRUD
//Create
productRouter.post("/product", createProduct)
//Read
productRouter.get("/products", readProduct)
//Update
productRouter.put("/product/:id", updateProduct)
//Delete
productRouter.delete("/product/:id", deleteProduct)

export default productRouter
