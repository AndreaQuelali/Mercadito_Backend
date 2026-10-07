import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { IUpdateOrderStatusDto } from "./dtos/updateStatus.dto";
import { sendOrderConfirmedEmail, sendOrderStatusEmail } from "../../tools/mail.tool";
import { notifyOrderStatus, notifyPayment } from "../../tools/notify.tool";
import {
  canConfirmPayment,
  canRejectPayment,
  canUploadProof,
  statusAfterPayment,
} from "./payment.rules";
import { PaymentProofInput, UpdatePaymentInput } from "./schemas/payment.schema";
import { checkTransition, OrderActor } from "./orderStateMachine";
import { OrderStatus, UserRole } from "@prisma/client";

/** Status history of an order, oldest first */
const EVENTS_INCLUDE = { orderBy: { createdAt: "asc" } } as const;

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
        events: EVENTS_INCLUDE,
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
        events: EVENTS_INCLUDE,
      },
    });
    if (!order) return { ok: false, message: "Order not found" };
    return { ok: true, message: "Order fetched", data: order };
  } catch (error) {
    return { ok: false, message: "Error fetching order" };
  }
}

interface StatusActor {
  userId: string;
  role: OrderActor;
  /** Stand of the seller, when the token carries it */
  sellerId?: string | null;
}

/**
 * Moves an order to a new status under the state machine, in one transaction:
 * the row is locked first, so two concurrent changes (e.g. two cancellations) are
 * serialized and the second one sees the final state. A cancellation gives the
 * stock back exactly once; every change is written to the order history.
 */
async function changeOrderStatus(
  orderId: number,
  to: OrderStatus,
  reason: string | undefined,
  actor: StatusActor
): Promise<IServiceResponse<any> & { code?: number }> {
  const trimmed = reason?.trim() || undefined;

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: { select: { id: true, email: true } },
        seller: { select: { id: true, userId: true } },
      },
    });

    // Ownership first: nobody learns anything about an order that is not theirs
    if (actor.role === "buyer" && (!order || order.userId !== actor.userId)) {
      return { ok: false, code: 404, message: "Order not found" } as const;
    }
    if (actor.role === "seller") {
      const owns =
        !!order && (actor.sellerId ? order.sellerId === actor.sellerId : order.seller.userId === actor.userId);
      if (!owns) {
        return { ok: false, code: 403, message: "Forbidden: this order does not belong to your stand" } as const;
      }
    }
    if (!order) return { ok: false, code: 404, message: "Order not found" } as const;

    const check = checkTransition({ from: order.status, to, actor: actor.role, reason: trimmed });
    if (!check.ok) return { ok: false, code: check.code, message: check.message } as const;

    const updated = await tx.order.update({ where: { id: orderId }, data: { status: to } });
    await tx.orderEvent.create({
      data: {
        orderId,
        actorId: actor.userId,
        actorRole: actor.role,
        from: order.status,
        to,
        reason: trimmed ?? null,
        forced: check.forced,
      },
    });

    // The checkout took the stock: a cancellation gives it back (an order already cancelled never gets here)
    if (to === "cancelled") {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    return { ok: true, order: updated, previous: order } as const;
  });

  if (!outcome.ok) return { ok: false, message: outcome.message, code: outcome.code };

  // Notifications are best-effort: they must never undo a committed change
  const { order, previous } = outcome;
  try {
    if (to === "confirmed") {
      await sendOrderConfirmedEmail(previous.user.email, orderId, order.fulfillment);
    } else {
      await sendOrderStatusEmail(previous.user.email, orderId, to, trimmed);
    }
    await notifyOrderStatus(previous.userId, orderId, to, trimmed);
    // The seller already knows what they did; tell them when the buyer (or an admin) acted
    if (actor.role !== "seller") await notifyOrderStatus(previous.seller.userId, orderId, to, trimmed);
  } catch {
    console.log(`[notify:fallback] order:status for order ${orderId} not delivered`);
  }

  return { ok: true, message: "Order status updated", data: order };
}

const failure = (r: { message: string; code?: number }) => ({ ok: false as const, message: r.message, code: r.code });

/** Seller of the stand, or admin, moves an order forward (or cancels it with a reason). */
export async function updateOrderStatusService(
  orderId: number,
  payload: IUpdateOrderStatusDto,
  requesterId: string,
  requesterRole: UserRole,
  sellerId?: string | null
): Promise<IServiceResponse<any> & { code?: number }> {
  try {
    const result = await changeOrderStatus(orderId, payload.status, payload.reason, {
      userId: requesterId,
      role: requesterRole === UserRole.admin ? "admin" : "seller",
      sellerId,
    });
    return result.ok ? result : failure(result);
  } catch (error) {
    return { ok: false, message: "Error updating order status" };
  }
}

/** The buyer cancels their own order while the seller has not confirmed it. */
export async function cancelOrderService(
  userId: string,
  orderId: number,
  reason?: string
): Promise<IServiceResponse<any> & { code?: number }> {
  try {
    const result = await changeOrderStatus(orderId, "cancelled", reason, { userId, role: "buyer" });
    return result.ok ? result : failure(result);
  } catch (error) {
    return { ok: false, message: "Error cancelling order" };
  }
}

export async function listSellerOrdersService(
  userId: string
): Promise<IServiceResponse<any[]>> {
  try {
    const orders = await prisma.order.findMany({
      where: { seller: { userId } },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true } },
        user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, phoneCountryCode: true } },
        events: EVENTS_INCLUDE,
      },
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
