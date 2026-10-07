import * as z from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Delivery data of a purchase. `delivery` needs an address and a reference;
 * `pickup` ignores them. The phone defaults to the buyer's profile when omitted.
 */
export const CheckoutSchema = z
  .object({
    fulfillment: z.enum(["pickup", "delivery"]),
    paymentMethod: z.enum(["cash_on_delivery", "qr_transfer"]).optional(),
    address: optionalText(200),
    addressRef: optionalText(200),
    contactPhone: optionalText(30),
    note: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment !== "delivery") return;
    if (!v.address) ctx.addIssue({ code: "custom", path: ["address"], message: "Address is required for delivery" });
    if (!v.addressRef) ctx.addIssue({ code: "custom", path: ["addressRef"], message: "Address reference is required for delivery" });
  })
  .transform((v) =>
    v.fulfillment === "pickup" ? { ...v, address: undefined, addressRef: undefined } : v
  );

export type CheckoutInput = {
  fulfillment: "pickup" | "delivery";
  /** Defaults to cash on delivery */
  paymentMethod?: "cash_on_delivery" | "qr_transfer";
  address?: string;
  addressRef?: string;
  contactPhone?: string;
  note?: string;
};
