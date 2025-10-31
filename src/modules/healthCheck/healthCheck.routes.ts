import { Router } from "express";
import { healthCheckController } from "./healthCheck.controller";

const healthRouter = Router();

healthRouter.get("/health", healthCheckController);

export default healthRouter;