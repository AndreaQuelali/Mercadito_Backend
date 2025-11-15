import { Category, Unit } from "@prisma/client";

export interface ICreateProduct {
    name: string;
    price: number;
    stock: number;
    unit: Unit;
    category: Category;
    description: string;
    image: string;  
    sellerId: string;
}