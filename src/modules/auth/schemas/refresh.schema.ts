import * as z from "zod";

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export type RefreshInput = z.infer<typeof RefreshSchema>;
