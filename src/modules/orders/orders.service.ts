import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { IUpdateOrderStatusDto } from "./dtos/updateStatus.dto";
import { sendOrderConfirmedEmail } from "../../tools/mail.tool";
import { notifyOrderStatus } from "../../tools/notify.tool";

export async function listMyOrdersService(
  userId: string
): Promise<IServiceResponse<any[]>> {
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true } },
      },
    });
    if (orders.length === 0) return { ok: false, message: "Orders not found" };
    return { ok: true, message: "Orders fetched", data: orders };
  } catch (error) {
    return { ok: false, message: "Error fetching orders" };
  }
}

export async function getOrderByIdService(
  userId: string,
  orderId: number
): Promise<IServiceResponse<any>> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: { include: { product: true } } },
    });
    if (!order) return { ok: false, message: "Order not found" };
    return { ok: true, message: "Order fetched", data: order };
  } catch (error) {
    return { ok: false, message: "Error fetching order" };
  }
}

export async function updateOrderStatusService(
  orderId: number,
  payload: IUpdateOrderStatusDto
): Promise<IServiceResponse<any>> {
  try {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: payload.status },
      include: { items: { include: { product: true } }, user: true },
    });
    if (payload.status === "confirmed") {
      await sendOrderConfirmedEmail(updated.user.email, updated.id);
      await notifyOrderStatus(updated.userId, updated.id, payload.status);
      const sellerIds = Array.from(
        new Set(updated.items.map((i: any) => i.product.sellerId))
      );
      await Promise.all(
        sellerIds.map((sid) =>
          notifyOrderStatus(sid, updated.id, payload.status)
        )
      );
    }
    return { ok: true, message: "Order status updated", data: updated };
  } catch (error: any) {
    if (error?.code === "P2025")
      return { ok: false, message: "Order not found" };
    return { ok: false, message: "Error updating order status" };
  }
}

export async function listSellerOrdersService(
  sellerId: string
): Promise<IServiceResponse<any[]>> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        items: { some: { product: { sellerId } } },
      },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } }, user: true },
    });
    if (orders.length === 0) return { ok: false, message: "Orders not found" };
    return { ok: true, message: "Seller orders fetched", data: orders };
  } catch (error) {
    return { ok: false, message: "Error fetching seller orders" };
  }
}
