export interface IProduct {
    id: number;
    name: string;
    price: number;
    stock: number;
    unit: string;
    category: string;
    description: string;
    image: string;
    createdAt: Date;
    updatedAt: Date;
}