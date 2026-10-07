import { Request, Response } from "express";
import {
  cancelOrderService,
  getOrderByIdService,
  listMyOrdersService,
  listSellerOrdersService,
  updateOrderStatusService,
  updatePaymentService,
  uploadPaymentProofService,
} from "./orders.service";
import { PaymentProofSchema, UpdatePaymentSchema } from "./schemas/payment.schema";
import { CancelOrderSchema, UpdateOrderStatusSchema } from "./schemas/updateOrderStatus.schema";
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
      const status = result.code ?? (result.message.startsWith("Forbidden") ? 403 : 400);
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

const statusOf = (message: string) =>
  message.startsWith("Forbidden") ? 403 : message.startsWith("Conflict") ? 409 : message.endsWith("not found") ? 404 : 400;

export const uploadPaymentProof = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      return res.status(400).send({ message: "Invalid order id", ok: false, status: 400 });
    }
    const { success, data, error } = PaymentProofSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }
    const result = await uploadPaymentProofService(userId, orderId, data);
    if (!result.ok) {
      const status = statusOf(result.message);
      return res.status(status).send({ message: result.message, ok: false, status });
    }
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error uploading payment proof", ok: false, status: 500 });
  }
};

export const updatePayment = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      return res.status(400).send({ message: "Invalid order id", ok: false, status: 400 });
    }
    const { success, data, error } = UpdatePaymentSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }
    const result = await updatePaymentService(
      orderId,
      data,
      req.user?.sub as string,
      req.user?.role as UserRole,
      (req.user?.sellerId as string | null | undefined) ?? null
    );
    if (!result.ok) {
      const status = statusOf(result.message);
      return res.status(status).send({ message: result.message, ok: false, status });
    }
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating payment", ok: false, status: 500 });
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId)) {
      return res.status(400).send({ message: "Invalid order id", ok: false, status: 400 });
    }
    const { success, data, error } = CancelOrderSchema.safeParse(req.body ?? {});
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }
    const result = await cancelOrderService(req.user?.sub as string, orderId, data.reason);
    if (!result.ok) {
      const status = result.code ?? 400;
      return res.status(status).send({ message: result.message, ok: false, status });
    }
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error cancelling order", ok: false, status: 500 });
  }
};
