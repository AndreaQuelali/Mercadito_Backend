import { enqueueMail, initMailWorker } from "./mailQueue.tool";

export async function sendOrderConfirmedEmail(
  toEmail: string,
  orderId: number,
  fulfillment?: "pickup" | "delivery"
) {
  const how =
    fulfillment === "delivery"
      ? " It will be delivered to your address."
      : fulfillment === "pickup"
        ? " You can pick it up at the seller's stand."
        : "";
  await enqueueMail({
    to: toEmail,
    subject: `Order #${orderId} confirmed`,
    text: `Your order #${orderId} has been confirmed.${how} Thank you for your purchase!`,
  });
}

const STATUS_TEXT: Record<string, string> = {
  paid: "has been marked as paid",
  shipped: "is on its way",
  delivered: "has been delivered",
  cancelled: "has been cancelled",
};

/** Status change mail for every status except confirmed (which has its own). */
export async function sendOrderStatusEmail(toEmail: string, orderId: number, status: string, reason?: string) {
  const what = STATUS_TEXT[status] ?? `is now ${status}`;
  await enqueueMail({
    to: toEmail,
    subject: `Order #${orderId} ${status}`,
    text: `Your order #${orderId} ${what}.${reason ? ` Reason: ${reason}.` : ""}`,
  });
}

export { initMailWorker };
