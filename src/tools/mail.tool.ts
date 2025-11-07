import { enqueueMail, initMailWorker } from "./mailQueue.tool";

export async function sendOrderConfirmedEmail(toEmail: string, orderId: number) {
  await enqueueMail({
    to: toEmail,
    subject: `Order #${orderId} confirmed`,
    text: `Your order #${orderId} has been confirmed. Thank you for your purchase!`,
  });
}

export { initMailWorker };
