import { IServiceResponse } from "../../types";
import { ICreateProduct } from "./dtos/createProduct.dto";
import { IUpdateProduct } from "./dtos/updateProduct.dto";
import { IProduct } from "./interfaces/product.interface";
import prisma from "../../config/prisma";
import { IProductFilter } from "./dtos/productFilter.dto";

export const createProductService = async (
  payload: ICreateProduct
): Promise<IServiceResponse<IProduct | null>> => {
  try {
    const product = await prisma.product.create({
      data: payload,
    });

    return {
      message: "Product created successfully",
      ok: true,
      data: product
    };
  } catch (error) {
    return {
      message: "Error creating product",
      ok: false,
      data: null,
    };
  }
};

export const readProductService = async (
  filter: IProductFilter = {}
): Promise<IServiceResponse<IProduct[] | null>> => {
  try {
    const where: any = {};

    if (filter.name) {
      where.name = { contains: filter.name, mode: "insensitive" };
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.price = {};
      if (filter.minPrice !== undefined) where.price.gte = filter.minPrice;
      if (filter.maxPrice !== undefined) where.price.lte = filter.maxPrice;
    }

    if (filter.startAt || filter.endAt) {
      where.createdAt = {};
      if (filter.startAt) where.createdAt.gte = new Date(filter.startAt);
      if (filter.endAt) where.createdAt.lte = new Date(filter.endAt);
    }

    const result = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (Array.isArray(result) && result.length === 0) {
      return {
        message: "Products not found",
        ok: false,
        data: null,
      };
    }

    return {
      message: "Products",
      ok: true,
      data: result as unknown as IProduct[],
    };
  } catch (error) {
    return {
      message: "Error reading products",
      ok: false,
      data: null,
    };
  }
};

export const updateProductService = async (
  id: number,
  payload: IUpdateProduct
): Promise<IServiceResponse<IProduct | null>> => {
  try {
    const existing = await prisma.product.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return {
        message: "Product not found",
        ok: false,
        data: null,
      };
    }

    const updated = await prisma.product.update({
      where: { id: Number(id) },
      data: payload,
    });

    return {
      message: "Product updated successfully",
      ok: true,
      data: updated,
    };
  } catch (error) {
    return {
      message: "Error updating product",
      ok: false,
      data: null,
    };
  }
};

export const deleteProductService = async (
  id: number
): Promise<IServiceResponse<IProduct | null>> => {
  try {
    const existing = await prisma.product.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return {
        message: "Product not found",
        ok: false,
        data: null,
      };
    }

    const deleted = await prisma.product.delete({
      where: { id: Number(id) },
    });

    return {
      message: "Product deleted successfully",
      ok: true,
      data: deleted,
    };
  } catch (error) {
    return {
      message: "Error deleting product",
      ok: false,
      data: null,
    };
  }
};