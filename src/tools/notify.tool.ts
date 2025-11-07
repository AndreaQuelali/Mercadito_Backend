import { getIO } from "../config/socket";

export async function notifyOrderStatus(userId: string, orderId: number, status: string) {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit("order:status", { orderId, status });
  } catch {
    console.log(`[notify:fallback] User ${userId} notified: Order #${orderId} -> ${status}`);
  }
}
