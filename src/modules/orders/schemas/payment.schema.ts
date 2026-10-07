import * as z from "zod";

export const PaymentProofSchema = z.object({
  url: z.string().trim().url("url must be a valid URL").max(500),
});

export const UpdatePaymentSchema = z
  .object({
    action: z.enum(["confirm", "reject"]),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.action !== "reject" || !!v.reason, {
    path: ["reason"],
    message: "A reason is required to reject a payment",
  });

export type PaymentProofInput = z.infer<typeof PaymentProofSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;
