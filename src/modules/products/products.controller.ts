import { Request, Response } from "express";
import { createProductService, deleteProductService, readProductService, updateProductService } from "./products.service";

export const createProduct = async (req: Request, res: Response) => {
    try {
    const data = req.body;
    const result = await createProductService(data);
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(201).send({message: result.message, status: 201, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error creating product", status: 500, ok: false, error: error});
    }
};

export const readProduct = async (req: Request, res: Response) => {
    try {
    const query = req.query;
    const filter: any = {};

    if (typeof query.name === "string") {
      const sanitized = query.name.trim();
      if (sanitized.length > 0 && sanitized.length <= 255) {
        filter.name = sanitized;
      }
    }

    if (typeof query.category === "string") {
      const sanitized = query.category.trim();
      if (sanitized.length > 0 && sanitized.length <= 255) {
        filter.category = sanitized;
      }
    }

    if (typeof query.minPrice === "string") {
      const n = Number(query.minPrice);
      if (!Number.isNaN(n)) filter.minPrice = n;
    }
    if (typeof query.maxPrice === "string") {
      const n = Number(query.maxPrice);
      if (!Number.isNaN(n)) filter.maxPrice = n;
    }

    if (typeof query.startAt === "string") {
      const d = new Date(query.startAt);
      if (!Number.isNaN(d.getTime())) filter.startAt = d;
    }
    if (typeof query.endAt === "string") {
      const d = new Date(query.endAt);
      if (!Number.isNaN(d.getTime())) filter.endAt = d;
    }

    const result = await readProductService(filter);
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error reading products", status: 500, ok: false, error: error});
    }
};

export const updateProduct = async (req: Request, res: Response) => {
    try {
    const data = req.body;
    const id = req.params.id;
  
    const result = await updateProductService(Number(id), data);
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error updating product", status: 500, ok: false, error: error});
    }
};

export const deleteProduct = async (req: Request, res: Response) => {
    try {
    const id = req.params.id;
   const result = await deleteProductService(Number(id));
    if (!result.ok) {
        return res.status(400).send({message: result.message, status: 400, ok: false});
    }
    res.status(200).send({message: result.message, status: 200, ok: true, data: result.data});
    } catch (error) {
        res.status(500).send({message: "Error deleting product", status: 500, ok: false, error: error});
    }
};

