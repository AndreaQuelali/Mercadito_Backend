import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { IUpdateOrderStatusDto } from "./dtos/updateStatus.dto";
import { sendOrderConfirmedEmail } from "../../tools/mail.tool";
import { notifyOrderStatus, notifyPayment } from "../../tools/notify.tool";
import {
  canConfirmPayment,
  canRejectPayment,
  canUploadProof,
  statusAfterPayment,
} from "./payment.rules";
import { PaymentProofInput, UpdatePaymentInput } from "./schemas/payment.schema";
import { UserRole } from "@prisma/client";

/** What the buyer needs from the stand to pay: where, how and the QR. */
const BUYER_SELLER_SELECT = {
  id: true,
  businessName: true,
  location: true,
  acceptsCash: true,
  acceptsQr: true,
  paymentQrUrl: true,
  paymentInstructions: true,
} as const;

export async function listMyOrdersService(
  userId: string
): Promise<IServiceResponse<any[]>> {
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true } },
        seller: { select: BUYER_SELLER_SELECT },
      },
    });
    if (orders.length === 0) return { ok: false, message: "Orders not found" };

    // One entry per purchase, newest first (orders are already sorted)
    const byCheckout = new Map<string, any[]>();
    for (const o of orders) {
      byCheckout.set(o.checkoutId, [...(byCheckout.get(o.checkoutId) ?? []), o]);
    }
    const groups = [...byCheckout].map(([checkoutId, group]) => ({
      checkoutId,
      createdAt: group[0].createdAt,
      fulfillment: group[0].fulfillment,
      total: group.reduce((sum, o) => sum + Number(o.total), 0),
      orders: group,
    }));
    return { ok: true, message: "Orders fetched", data: groups };
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
      include: {
        items: { include: { product: true } },
        seller: { select: BUYER_SELLER_SELECT },
      },
    });
    if (!order) return { ok: false, message: "Order not found" };
    return { ok: true, message: "Order fetched", data: order };
  } catch (error) {
    return { ok: false, message: "Error fetching order" };
  }
}

export async function updateOrderStatusService(
  orderId: number,
  payload: IUpdateOrderStatusDto,
  requesterId: string,
  requesterRole: UserRole,
  sellerId?: string | null
): Promise<IServiceResponse<any>> {
  try {
    // Non-admin sellers may only update the orders of their own stand
    if (requesterRole !== UserRole.admin) {
      const orderBelongsToSeller = await prisma.order.findFirst({
        where: {
          id: orderId,
          ...(sellerId ? { sellerId } : { seller: { userId: requesterId } }),
        },
      });
      if (!orderBelongsToSeller) {
        return {
          ok: false,
          message: "Forbidden: this order does not belong to your stand",
        };
      }
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: payload.status },
      include: {
        items: { include: { product: true } },
        seller: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (payload.status === "confirmed") {
      await sendOrderConfirmedEmail(updated.user.email, updated.id, updated.fulfillment);
      await notifyOrderStatus(updated.userId, updated.id, payload.status);
      await notifyOrderStatus(updated.seller.userId, updated.id, payload.status);
    }
    return { ok: true, message: "Order status updated", data: updated };
  } catch (error: any) {
    if (error?.code === "P2025")
      return { ok: false, message: "Order not found" };
    return { ok: false, message: "Error updating order status" };
  }
}

export async function listSellerOrdersService(
  userId: string
): Promise<IServiceResponse<any[]>> {
  try {
    const orders = await prisma.order.findMany({
      where: { seller: { userId } },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } }, user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, phoneCountryCode: true } } },
    });
    if (orders.length === 0) return { ok: false, message: "Orders not found" };
    return { ok: true, message: "Seller orders fetched", data: orders };
  } catch (error) {
    return { ok: false, message: "Error fetching seller orders" };
  }
}

/** Buyer attaches (or replaces a rejected) payment proof to their own order. */
export async function uploadPaymentProofService(
  userId: string,
  orderId: number,
  payload: PaymentProofInput
): Promise<IServiceResponse<any>> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { seller: { select: { userId: true } } },
    });
    if (!order) return { ok: false, message: "Order not found" };

    const check = canUploadProof(order);
    if (!check.ok) return { ok: false, message: `Conflict: ${check.message}` };

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "proof_uploaded",
        paymentProofUrl: payload.url,
        paymentRejectReason: null,
      },
    });
    await notifyPayment(order.seller.userId, "payment:proof", orderId, { total: String(order.total) });
    return { ok: true, message: "Payment proof uploaded", data: updated };
  } catch (error) {
    return { ok: false, message: "Error uploading payment proof" };
  }
}

/** The stand's seller (or an admin) confirms or rejects the payment of an order. */
export async function updatePaymentService(
  orderId: number,
  payload: UpdatePaymentInput,
  requesterId: string,
  requesterRole: UserRole,
  sellerId?: string | null
): Promise<IServiceResponse<any>> {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(requesterRole === UserRole.admin
          ? {}
          : sellerId
            ? { sellerId }
            : { seller: { userId: requesterId } }),
      },
    });
    if (!order) {
      return requesterRole === UserRole.admin
        ? { ok: false, message: "Order not found" }
        : { ok: false, message: "Forbidden: this order does not belong to your stand" };
    }

    const check =
      payload.action === "confirm" ? canConfirmPayment(order) : canRejectPayment(order);
    if (!check.ok) return { ok: false, message: `Conflict: ${check.message}` };

    const updated =
      payload.action === "confirm"
        ? await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "paid",
              paidAt: new Date(),
              paymentRejectReason: null,
              status: statusAfterPayment(order.status),
            },
          })
        : await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: "rejected", paymentRejectReason: payload.reason },
          });

    if (payload.action === "confirm") {
      await notifyPayment(order.userId, "payment:confirmed", orderId);
    } else {
      await notifyPayment(order.userId, "payment:rejected", orderId, { reason: payload.reason });
    }
    return { ok: true, message: "Payment updated", data: updated };
  } catch (error) {
    return { ok: false, message: "Error updating payment" };
  }
}
