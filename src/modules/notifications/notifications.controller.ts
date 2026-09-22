import { Request, Response } from "express";
import {
  listNotificationsService,
  markAllNotificationsReadService,
  markNotificationReadService,
} from "./notifications.service";
import { ListNotificationsQuerySchema } from "./schemas/listNotifications.schema";
import { ENV } from "../../config/env.config";

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;

    const { success, data, error } = ListNotificationsQuerySchema.safeParse(req.query);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await listNotificationsService(userId, data);
    if (!result.ok) return res.status(500).send({ message: result.message, ok: false, status: 500 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching notifications", ok: false, status: 500 });
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).send({ message: "Invalid notification id", ok: false, status: 400 });
    }

    const result = await markNotificationReadService(userId, id);
    if (!result.ok) {
      const status = result.message === "Notification not found" ? 404 : 500;
      return res.status(status).send({ message: result.message, ok: false, status });
    }
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating notification", ok: false, status: 500 });
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await markAllNotificationsReadService(userId);
    if (!result.ok) return res.status(500).send({ message: result.message, ok: false, status: 500 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating notifications", ok: false, status: 500 });
  }
};
