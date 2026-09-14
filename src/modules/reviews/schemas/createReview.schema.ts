import * as z from "zod";

export const CreateReviewSchema = z.object({
  productId: z.number().int().positive("productId must be a positive integer"),
  rating: z.number().int().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5"),
  comment: z.string().max(1000).optional(),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
