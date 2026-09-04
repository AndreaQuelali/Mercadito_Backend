import { Request, Response } from "express";
import {
  createProductService,
  deleteProductService,
  getProductByIdService,
  readProductService,
  updateProductService,
  listSellerProductsService,
} from "./products.service";
import { CreateProductSchema } from "./schemas/createProduct.schema";
import { UpdateProductSchema } from "./schemas/updateProduct.schema";
import { ENV } from "../../config/env.config";
import { Category } from "@prisma/client";

export const createProduct = async (req: Request, res: Response) => {
  try {
    const sellerId = req.user?.sub as string;
    if (!sellerId) {
      return res.status(401).send({ message: "No autorizado", status: 401, ok: false });
    }

    const { success, data, error } = CreateProductSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await createProductService({ ...data, sellerId });
    if (!result.ok) {
      return res.status(400).send({ message: result.message, status: 400, ok: false });
    }
    res.status(201).send({ message: result.message, status: 201, ok: true, data: result.data });
  } catch (error) {
    res.status(500).send({ message: "Error creating product", status: 500, ok: false });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).send({ message: "Invalid product id", status: 400, ok: false });
    }
    const result = await getProductByIdService(id);
    if (!result.ok) {
      return res.status(404).send({ message: result.message, status: 404, ok: false });
    }
    res.status(200).send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    res.status(500).send({ message: "Error fetching product", status: 500, ok: false });
  }
};

export const listSellerProducts = async (req: Request, res: Response) => {
  try {
    const sellerId = req.user?.sub as string;
    if (!sellerId) return res.status(401).send({ ok: false, status: 401, message: "No autorizado" });
    const result = await listSellerProductsService(sellerId);
    if (!result.ok) return res.status(404).send({ ok: false, status: 404, message: result.message });
    return res.status(200).send({ ok: true, status: 200, message: result.message, data: result.data });
  } catch (error) {
    return res.status(500).send({ ok: false, status: 500, message: "Error fetching seller products" });
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
      const sanitized = query.category.trim() as Category;
      if (Object.values(Category).includes(sanitized)) {
        filter.category = sanitized;
      } else if (sanitized.length > 0) {
        return res.status(400).send({
          message: `Invalid category. Allowed: ${Object.values(Category).join(", ")}`,
          status: 400,
          ok: false,
        });
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
      return res.status(500).send({ message: result.message, status: 500, ok: false });
    }
    res.status(200).send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    res.status(500).send({ message: "Error reading products", status: 500, ok: false });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const sellerId = req.user?.sub as string;
    const id = Number(req.params.id);

    const { success, data, error } = UpdateProductSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await updateProductService(id, data, sellerId);
    if (!result.ok) {
      const status = result.message.startsWith("Forbidden") ? 403 : 400;
      return res.status(status).send({ message: result.message, status, ok: false });
    }
    res.status(200).send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    res.status(500).send({ message: "Error updating product", status: 500, ok: false });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const sellerId = req.user?.sub as string;
    const id = Number(req.params.id);

    const result = await deleteProductService(id, sellerId);
    if (!result.ok) {
      const status = result.message.startsWith("Forbidden") ? 403 : 400;
      return res.status(status).send({ message: result.message, status, ok: false });
    }
    res.status(200).send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    res.status(500).send({ message: "Error deleting product", status: 500, ok: false });
  }
};
