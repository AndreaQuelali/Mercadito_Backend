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

export { initMailWorker };
