import { Request, Response } from "express";
import {
  addToCartService,
  checkoutService,
  clearCartService,
  getCartService,
  removeCartItemService,
  updateCartItemService,
} from "./carts.service";
import { AddToCartSchema } from "./schemas/addToCart.schema";
import { UpdateCartItemSchema } from "./schemas/updateCartItem.schema";
import { ENV } from "../../config/env.config";

export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await getCartService(userId);
    if (!result.ok) return res.status(500).send({ message: result.message, ok: false, status: 500 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching cart", ok: false, status: 500 });
  }
};

export const addToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;

    const { success, data, error } = AddToCartSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await addToCartService(userId, data);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error adding to cart", ok: false, status: 500 });
  }
};

export const removeCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const itemId = Number(req.params.itemId);
    if (Number.isNaN(itemId)) {
      return res.status(400).send({ message: "Invalid item id", ok: false, status: 400 });
    }
    const result = await removeCartItemService(userId, itemId);
    if (!result.ok) return res.status(404).send({ message: result.message, ok: false, status: 404 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error removing cart item", ok: false, status: 500 });
  }
};

export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const itemId = Number(req.params.itemId);
    if (Number.isNaN(itemId)) {
      return res.status(400).send({ message: "Invalid item id", ok: false, status: 400 });
    }

    const { success, data, error } = UpdateCartItemSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const result = await updateCartItemService(userId, itemId, data.quantity);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error updating cart item", ok: false, status: 500 });
  }
};

export const clearCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await clearCartService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error clearing cart", ok: false, status: 500 });
  }
};

export const checkout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await checkoutService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(201).send({ message: result.message, ok: true, status: 201, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error during checkout", ok: false, status: 500 });
  }
};
