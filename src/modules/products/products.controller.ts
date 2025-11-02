import { Request, Response } from "express";
import { createProductService, deleteProductService, readProductService, updateProductService } from "./products.service";

export const createProduct = (req: Request, res: Response) => {
    try {
    const data = req.body;
    const result = createProductService(data);
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(201).send({message: result.message, status: 201, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error creating product", status: 500, ok: false, error: error});
    }
};

export const readProduct = (req: Request, res: Response) => {
    try {
    const result = readProductService();
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error reading products", status: 500, ok: false, error: error});
    }
};

export const updateProduct = (req: Request, res: Response) => {
    try {
    const data = req.body;
    const id = req.params.id;
  
    const result = updateProductService(Number(id), data);
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error updating product", status: 500, ok: false, error: error});
    }
};

export const deleteProduct = (req: Request, res: Response) => {
    try {
    const id = req.params.id;
   const result = deleteProductService(Number(id));
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error deleting product", status: 500, ok: false, error: error});
    }
};

