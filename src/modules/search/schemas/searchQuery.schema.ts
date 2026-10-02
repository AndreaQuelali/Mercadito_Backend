import * as z from "zod";
import { Category } from "@prisma/client";

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required").max(200, "q must be at most 200 characters"),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  category: z.nativeEnum(Category).optional(),
  includeOutOfStock: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
