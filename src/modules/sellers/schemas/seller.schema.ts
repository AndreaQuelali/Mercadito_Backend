import { z } from "zod";

export const CreateSellerSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  location: z.string().trim().max(255).optional(),
});

export const UpdateSellerSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  location: z.string().trim().max(255).nullable().optional(),
});

export const UpdateSellerStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
