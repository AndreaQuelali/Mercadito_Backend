import { Category } from "@prisma/client";

export interface IProductFilter {
  name?: string;
  category?: Category;
  minPrice?: number;
  maxPrice?: number;
  startAt?: Date;
  endAt?: Date; 
}
