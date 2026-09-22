import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";

const notificationRouter = Router();

notificationRouter.use(validateSesionUser);

notificationRouter.get("/", listNotifications);
// Must be BEFORE /:id/read
notificationRouter.patch("/read-all", markAllNotificationsRead);
notificationRouter.patch("/:id/read", markNotificationRead);

export default notificationRouter;
