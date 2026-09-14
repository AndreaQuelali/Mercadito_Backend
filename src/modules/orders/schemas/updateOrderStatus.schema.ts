import * as z from "zod";
import { OrderStatus } from "@prisma/client";

export const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
