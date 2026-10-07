import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

export interface PaymentState {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export type PaymentCheck = { ok: true } | { ok: false; message: string };

const deny = (message: string): PaymentCheck => ({ ok: false, message });

/** Buyer uploads (or replaces a rejected) proof. Only QR/transfer orders have one. */
export function canUploadProof(o: PaymentState): PaymentCheck {
  if (o.status === "cancelled") return deny("The order is cancelled");
  if (o.paymentMethod !== "qr_transfer") return deny("This order is paid on delivery: there is no proof to upload");
  if (o.paymentStatus === "paid") return deny("The payment is already confirmed");
  if (o.paymentStatus === "proof_uploaded") return deny("A proof is already waiting for the seller");
  return { ok: true };
}

/** Seller confirms: QR needs a proof first; cash is collected on delivery. */
export function canConfirmPayment(o: PaymentState): PaymentCheck {
  if (o.status === "cancelled") return deny("The order is cancelled");
  if (o.paymentStatus === "paid") return deny("The payment is already confirmed");
  if (o.paymentMethod === "qr_transfer" && o.paymentStatus !== "proof_uploaded") {
    return deny("There is no payment proof to confirm");
  }
  if (o.paymentMethod === "cash_on_delivery" && o.paymentStatus !== "unpaid") {
    return deny("This payment cannot be confirmed");
  }
  return { ok: true };
}

/** Seller rejects a proof that is waiting for review. */
export function canRejectPayment(o: PaymentState): PaymentCheck {
  if (o.status === "cancelled") return deny("The order is cancelled");
  if (o.paymentStatus !== "proof_uploaded") return deny("There is no payment proof to reject");
  return { ok: true };
}

/** Paying moves a pending order to `paid`; any later status is kept. */
export function statusAfterPayment(status: OrderStatus): OrderStatus {
  return status === "pending" ? "paid" : status;
}
