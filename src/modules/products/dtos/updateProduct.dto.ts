import { Category, Unit } from "@prisma/client";

export interface IUpdateProduct {
    price?: number;
    stock?: number;
    unit?: Unit;
    category?: Category;
    description?: string;
    image?: string;
}