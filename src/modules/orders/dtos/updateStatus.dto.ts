import { OrderStatus } from "@prisma/client";

export interface IUpdateOrderStatusDto {
  status: OrderStatus;
}
