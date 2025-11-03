import express from "express";
import bodyParser from "body-parser";
import router from "./config/server.routes";
import { prisma } from "./config/prisma";
import { ENV } from "./config/env.config";

async function init() {
    try {
        await prisma.$connect();
        console.log("Database connection established");

        const PORT = ENV.PORT || 3001;
        const app = express();
        app.use(bodyParser.json());
        app.use("/", router);


        app.listen(PORT, () => {
            console.log(`Server running on port http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Error connecting to the database:", error);
        process.exit(1);
    }
}

init();
