import * as z from "zod";

const passwordPolicyRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,150}$/;

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z
    .string()
    .min(8)
    .max(150)
    .regex(passwordPolicyRegex),
});
