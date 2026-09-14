import * as z from "zod";

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;
