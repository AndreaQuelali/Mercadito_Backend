import { Router } from "express";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { confirm, getConversation, getStatus, reject, sendMessage } from "./assistant.controller";

const assistantRouter = Router();

// Public: the frontend needs it to decide whether to show the button before anyone logs in
assistantRouter.get("/status", getStatus);

assistantRouter.use(validateSesionUser);

assistantRouter.get("/conversations/:id", getConversation);
assistantRouter.post("/messages", sendMessage);
assistantRouter.post("/actions/:id/confirm", confirm);
assistantRouter.post("/actions/:id/reject", reject);

export default assistantRouter;
