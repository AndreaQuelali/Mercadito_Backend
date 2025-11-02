import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import router from "./config/server.routes";

dotenv.config();
const PORT = process.env.PORT || 3001;
const app = express();
app.use(bodyParser.json());
app.use("/", router);


app.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});