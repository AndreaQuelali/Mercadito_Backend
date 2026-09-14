import * as z from "zod";
import { Category, Unit } from "@prisma/client";

export const UpdateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  price: z.number().positive("Price must be positive").optional(),
  stock: z.number().int().nonnegative("Stock must be >= 0").optional(),
  unit: z.nativeEnum(Unit).optional(),
  category: z.nativeEnum(Category).optional(),
  description: z.string().min(1).max(1000).optional(),
  image: z.string().url("Image must be a valid URL").optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
