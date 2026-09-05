import { Request, Response } from "express";
import {
  getOrderByIdService,
  listMyOrdersService,
  listSellerOrdersService,
  updateOrderStatusService,
} from "./orders.service";
import { UpdateOrderStatusSchema } from "./schemas/updateOrderStatus.schema";
import { ENV } from "../../config/env.config";
import { UserRole } from "@prisma/client";

export const listMyOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await listMyOrdersService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching orders", ok: false, status: 500 });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const orderId = Number(req.params.id);
    const result = await getOrderByIdService(userId, orderId);
    if (!result.ok) return res.status(404).send({ message: result.message, ok: false, status: 404 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching order", ok: false, status: 500 });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const requesterId = req.user?.sub as string;
    const requesterRole = req.user?.role as UserRole;

    const { success, data, error } = UpdateOrderStatusSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const sellerId = (req.user?.sellerId as string | null | undefined) ?? null;
    const result = await updateOrderStatusService(
      orderId,
      data,
      requesterId,
      requesterRole,
      sellerId
    );
    if (!result.ok) {
      const status = result.message.startsWith("Forbidden") ? 403 : 400;
      return res.status(status).send({ message: result.message, ok: false, status });
    }
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating order status", ok: false, status: 500 });
  }
};

export const listSellerOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await listSellerOrdersService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching seller orders", ok: false, status: 500 });
  }
};
