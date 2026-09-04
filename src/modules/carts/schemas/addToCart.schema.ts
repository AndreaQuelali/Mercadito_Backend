import * as z from "zod";

export const AddToCartSchema = z.object({
  productId: z.number().int().positive("productId must be a positive integer"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export type AddToCartInput = z.infer<typeof AddToCartSchema>;
