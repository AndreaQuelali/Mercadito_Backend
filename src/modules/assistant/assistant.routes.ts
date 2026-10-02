import { Router } from "express";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { confirm, getStatus, reject, sendMessage } from "./assistant.controller";

const assistantRouter = Router();

assistantRouter.use(validateSesionUser);

assistantRouter.get("/status", getStatus);
assistantRouter.post("/messages", sendMessage);
assistantRouter.post("/actions/:id/confirm", confirm);
assistantRouter.post("/actions/:id/reject", reject);

export default assistantRouter;
