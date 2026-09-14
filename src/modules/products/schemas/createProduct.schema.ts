import * as z from "zod";
import { Category, Unit } from "@prisma/client";

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().positive("Price must be positive"),
  stock: z.number().int().nonnegative("Stock must be >= 0"),
  unit: z.nativeEnum(Unit),
  category: z.nativeEnum(Category),
  description: z.string().min(1).max(1000),
  image: z.string().url("Image must be a valid URL"),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
