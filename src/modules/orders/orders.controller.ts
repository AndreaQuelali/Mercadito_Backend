import { Request, Response } from "express";
import { getOrderByIdService, listMyOrdersService, updateOrderStatusService } from "./orders.service";
import { IUpdateOrderStatusDto } from "./dtos/updateStatus.dto";

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
    const payload = req.body as IUpdateOrderStatusDto;
    const result = await updateOrderStatusService(orderId, payload);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating order status", ok: false, status: 500 });
  }
};
