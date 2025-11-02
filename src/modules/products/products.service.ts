import { IServiceResponse } from "../../types";
import { ICreateProduct } from "./dtos/createProduct.dto";
import { IUpdateProduct } from "./dtos/updateProduct";
import { IProduct } from "./interfaces/product.interface";

let products= [{
    id: 1,
    name: "Product 1",
    price: 10,
    stock: 10,
    unit: "Unit 1",
    category: "Category 1",
    description: "Description 1",
    image: "Image 1",
    createdAt: new Date(),
    updatedAt: new Date()
},{
    id: 2,
    name: "Product 2",
    price: 20,
    stock: 20,
    unit: "Unit 2",
    category: "Category 2",
    description: "Description 2",
    image: "Image 2",
    createdAt: new Date(),
    updatedAt: new Date()
},{
    id: 3,
    name: "Product 3",
    price: 30,
    stock: 30,
    unit: "Unit 3",
    category: "Category 3",
    description: "Description 3",
    image: "Image 3",
    createdAt: new Date(),
    updatedAt: new Date()
}];

export const createProductService = (payload: ICreateProduct) :IServiceResponse<IProduct | null> => {
    try {
    const product : IProduct = {
        id: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
    }
    products.push(product);
    return{
        message: "Product created successfully",
        ok: true,
        data: product
    }
    } catch (error) {
        return {
            message: "Error creating product",
            ok: false,
            data: null
        }
    }       
}

export const readProductService = () :IServiceResponse<IProduct[] | null> => {
    try {
    return{
        message: "Products",
        ok: true,
        data: products
    }
    } catch (error) {
        return {
            message: "Error reading products",
            ok: false,
            data: null
        }
    }       
}

export const updateProductService = (id: number, payload: IUpdateProduct) :IServiceResponse<IProduct | null> => {
    try {
    const product = products.find((product) => product.id === id);
    if (!product) {
        return{
            message: "Product not found",
            ok: false,
            data: null
        }
    }
    product.price = payload.price;
    product.stock = payload.stock;
    product.unit = payload.unit;
    product.category = payload.category;
    product.description = payload.description;
    product.image = payload.image;
    product.updatedAt = new Date();

    products.map((product) => {if (product.id === Number(id)) {
        product.price = payload.price;
        product.stock = payload.stock;
        product.unit = payload.unit;
        product.category = payload.category;
        product.description = payload.description;
        product.image = payload.image;
        product.updatedAt = new Date();
    }});
    return{
        message: "Product updated successfully",
        ok: true,
        data: product
    }
    } catch (error) {
        return {
            message: "Error updating product",
            ok: false,
            data: null
        }
    }       
}

export const deleteProductService = (id: number) :IServiceResponse<IProduct | null> => {
    try {
        const productIndex = products.findIndex((product) => product.id === Number(id));
        if (productIndex === -1) {
            return {
                message: "Product not found",
                ok: false,
                data: null
            }
        }
        const deletedProduct = products[productIndex];
    
        const newProducts = products.filter((product) => product.id !== Number(id));
        products = newProducts;
        
        return{
            message: "Product deleted successfully",
            ok: true,
            data: deletedProduct
        }
    } catch (error) {
        return {
            message: "Error deleting product",
            ok: false,
            data: null
        }
    }       
}