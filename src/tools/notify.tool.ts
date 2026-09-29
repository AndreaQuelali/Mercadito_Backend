import prisma from "../config/prisma";
import { ENV } from "../config/env.config";
import { getIO } from "../config/socket";
import { SELLER_EVENTS, isEventEnabled } from "../modules/sellers/notificationPrefs";

export type NotificationType =
  | "order:status"
  | "order:new"
  | "stock:low"
  | "review:new";

/** One product line of a completed checkout, with the stock left after the sale. */
export interface ISaleLine {
  sellerUserId?: string | null;
  productId: number;
  name: string;
  quantity: number;
  stock: number;
}

/** True when the user is a seller who turned this event off. Fails open: if unsure, deliver. */
async function isMutedBySeller(userId: string, type: NotificationType): Promise<boolean> {
  if (!(SELLER_EVENTS as readonly string[]).includes(type)) return false;
  try {
    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { notificationPrefs: true },
    });
    return !!seller && !isEventEnabled(seller.notificationPrefs, type);
  } catch {
    return false;
  }
}

/**
 * Persists the notification (history) and pushes it to the user's socket room.
 * Both steps are best-effort and independent: a failure in one never blocks the
 * other nor the business flow that triggered the notification.
 * Events a seller turned off in their settings are neither stored nor emitted.
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  if (await isMutedBySeller(userId, type)) return;

  try {
    await prisma.notification.create({
      data: { userId, type, payload: payload as any },
    });
  } catch {
    console.log(`[notify:history-failed] ${type} for user ${userId}`);
  }

  try {
    getIO().to(`user:${userId}`).emit(type, payload);
  } catch {
    console.log(`[notify:fallback] User ${userId} notified: ${type} ${JSON.stringify(payload)}`);
  }
}

export async function notifyOrderStatus(userId: string, orderId: number, status: string) {
  await notifyUser(userId, "order:status", { orderId, status });
}

/** Tells each seller about the new order (their items only) and about low stock. */
export async function notifyOrderCreated(orderId: number, sales: ISaleLine[]): Promise<void> {
  const bySeller = new Map<string, ISaleLine[]>();
  for (const line of sales) {
    if (!line.sellerUserId) continue;
    bySeller.set(line.sellerUserId, [...(bySeller.get(line.sellerUserId) ?? []), line]);
  }

  const threshold = ENV.LOW_STOCK_THRESHOLD;
  for (const [sellerUserId, lines] of bySeller) {
    await notifyUser(sellerUserId, "order:new", {
      orderId,
      items: lines.map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity })),
    });

    for (const l of lines.filter((l) => l.stock <= threshold)) {
      await notifyUser(sellerUserId, "stock:low", {
        productId: l.productId,
        name: l.name,
        stock: l.stock,
        threshold,
      });
    }
  }
}

/** Tells the seller that one of their products received a review. Never throws. */
export async function notifyNewReview(productId: number, rating: number): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, seller: { select: { userId: true } } },
    });
    if (!product?.seller?.userId) return;
    await notifyUser(product.seller.userId, "review:new", {
      productId,
      name: product.name,
      rating,
    });
  } catch {
    console.log(`[notify:fallback] review:new for product ${productId} not delivered`);
  }
}
