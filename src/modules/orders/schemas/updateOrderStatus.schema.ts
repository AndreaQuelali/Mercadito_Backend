import * as z from "zod";
import { OrderStatus } from "@prisma/client";

export const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  reason: z.string().trim().max(300).optional(),
});

export const CancelOrderSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
