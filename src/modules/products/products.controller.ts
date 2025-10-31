import { Request, Response } from "express";

let products= [{
    id: 1,
    name: "Product 1",
    price: 10,
    stock: 10,
    unit: "Unit 1",
    category: "Category 1",
    description: "Description 1",
    image: "Image 1",
    createdAt: "2025-10-31T15:56:00.000Z",
    updatedAt: "2025-10-31T15:56:00.000Z"
},{
    id: 2,
    name: "Product 2",
    price: 20,
    stock: 20,
    unit: "Unit 2",
    category: "Category 2",
    description: "Description 2",
    image: "Image 2",
    createdAt: "2025-10-31T15:56:00.000Z",
    updatedAt: "2025-10-31T15:56:00.000Z"
},{
    id: 3,
    name: "Product 3",
    price: 30,
    stock: 30,
    unit: "Unit 3",
    category: "Category 3",
    description: "Description 3",
    image: "Image 3",
    createdAt: "2025-10-31T15:56:00.000Z",
    updatedAt: "2025-10-31T15:56:00.000Z"
}];

export const createProduct = (req: Request, res: Response) => {
    const data = req.body;
    const product = {
        id: Date.now(),
        ...data
    }
    products.push(product);
    res.status(201).send({message: "Product created successfully", status: 201, ok: true, data: product});
};

export const readProduct = (req: Request, res: Response) => {
    res.status(200).send({message: "Products", status: 200, ok: true, data: products});
};

export const updateProduct = (req: Request, res: Response) => {
    try {
    const data = req.body;
    const id = req.params.id;
    const product = products.find((product) => product.id === Number(id));
    if (!product) {
        return res.status(404).send({message: "Product not found", status: 404, ok: false});
    }
    product.name = data.name;
    product.price = data.price;
    product.stock = data.stock;
    product.unit = data.unit;
    product.category = data.category;
    product.description = data.description;
    product.image = data.image;
    product.updatedAt = data.updatedAt;

    products.map((product) => {if (product.id === Number(id)) {
        product.name = data.name;
        product.price = data.price;
        product.stock = data.stock;
        product.unit = data.unit;
        product.category = data.category;
        product.description = data.description;
        product.image = data.image;
        product.updatedAt = data.updatedAt;
    }});
    res.status(200).send({message: "Product updated successfully", status: 200, ok: true, data: product});
    } catch (error) {
        res.status(500).send({message: "Error updating product", status: 500, ok: false, error: error});
    }
};

export const deleteProduct = (req: Request, res: Response) => {
    try {
    const id = req.params.id;
    const productIndex = products.findIndex((product) => product.id === Number(id));
    if (productIndex === -1) {
        return res.status(404).send({message: "Product not found", status: 404, ok: false});
    }
    const deletedProduct = products[productIndex];

    const newProducts = products.filter((product) => product.id !== Number(id));
    products = newProducts;
    
    res.status(200).send({message: "Product deleted successfully", status: 200, ok: true, data: deletedProduct});
    } catch (error) {
        res.status(500).send({message: "Error deleting product", status: 500, ok: false, error: error});
    }
};

