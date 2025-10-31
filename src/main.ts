import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import healthRouter from "./modules/healthCheck/healthCheck.routes";
import productRouter from "./modules/products/products.routes";

dotenv.config();
const PORT = process.env.PORT || 3001;
const app = express();
app.use(bodyParser.json());
app.use("/", healthRouter);
app.use("/", productRouter);


app.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});