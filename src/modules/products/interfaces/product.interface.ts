import { Decimal } from "@prisma/client/runtime/library";

export interface IProduct {
    id: number;
    name: string;
    price: Decimal;
    stock: number;
    unit: string;
    category: string;
    description: string;
    image: string;
    createdAt: Date;
    updatedAt: Date;
}
