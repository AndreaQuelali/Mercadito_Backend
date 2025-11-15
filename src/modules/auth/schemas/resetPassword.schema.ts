import * as z from "zod";

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(6).max(150),
});
