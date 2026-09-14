import { Request, Response } from "express";
import { ENV } from "../../config/env.config";
import {
  CreateSellerSchema,
  UpdateSellerSchema,
  UpdateSellerStatusSchema,
} from "./schemas/seller.schema";
import {
  createSellerService,
  deleteMySellerService,
  getMySellerService,
  listSellersService,
  updateMySellerService,
  updateSellerStatusService,
} from "./sellers.service";
import { generateAccessToken } from "../../tools/jwt.tool";
import prisma from "../../config/prisma";

export const createSeller = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const { success, data, error } = CreateSellerSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await createSellerService(userId, data);
    if (!result.ok) {
      const status =
        result.message.includes("already exists") ||
        result.message.includes("Admins cannot")
          ? result.message.includes("already exists")
            ? 409
            : 403
          : 400;
      return res.status(status).send({ message: result.message, status, ok: false });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).send({ message: "Unauthorized", status: 401, ok: false });
    }

    const token = generateAccessToken({
      sub: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      sellerId: result.data.id,
    });

    return res.status(201).send({
      message: result.message,
      status: 201,
      ok: true,
      data: result.data,
      token,
    });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error creating seller", status: 500, ok: false });
  }
};

export const getMySeller = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await getMySellerService(userId);
    if (!result.ok) {
      return res.status(404).send({ message: result.message, status: 404, ok: false });
    }
    return res
      .status(200)
      .send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error fetching seller", status: 500, ok: false });
  }
};

export const updateMySeller = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const { success, data, error } = UpdateSellerSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await updateMySellerService(userId, data);
    if (!result.ok) {
      return res.status(400).send({ message: result.message, status: 400, ok: false });
    }
    return res
      .status(200)
      .send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error updating seller", status: 500, ok: false });
  }
};

export const deleteMySeller = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await deleteMySellerService(userId);
    if (!result.ok) {
      const status = result.message.includes("products exist") ? 409 : 400;
      return res.status(status).send({ message: result.message, status, ok: false });
    }
    return res
      .status(200)
      .send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error deleting seller", status: 500, ok: false });
  }
};

export const listSellers = async (_req: Request, res: Response) => {
  try {
    const result = await listSellersService();
    if (!result.ok) {
      return res.status(400).send({ message: result.message, status: 400, ok: false });
    }
    return res
      .status(200)
      .send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error listing sellers", status: 500, ok: false });
  }
};

export const updateSellerStatus = async (req: Request, res: Response) => {
  try {
    const sellerId = req.params.id;
    const { success, data, error } = UpdateSellerStatusSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await updateSellerStatusService(sellerId, data);
    if (!result.ok) {
      const status = result.message === "Seller not found" ? 404 : 400;
      return res.status(status).send({ message: result.message, status, ok: false });
    }
    return res
      .status(200)
      .send({ message: result.message, status: 200, ok: true, data: result.data });
  } catch (error) {
    return res
      .status(500)
      .send({ message: "Error updating seller status", status: 500, ok: false });
  }
};
