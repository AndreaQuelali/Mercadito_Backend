import { Request, Response } from "express";
import { addToCartService, checkoutService, getCartService } from "./carts.service";
import { IAddToCartDto } from "./dtos/addToCart.dto";

export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await getCartService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error fetching cart", ok: false, status: 500 });
  }
};

export const addToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const payload = req.body as IAddToCartDto;
    const result = await addToCartService(userId, payload);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error adding to cart", ok: false, status: 500 });
  }
};

export const checkout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.sub as string;
    const result = await checkoutService(userId);
    if (!result.ok) return res.status(400).send({ message: result.message, ok: false, status: 400 });
    return res.status(200).send({ message: result.message, ok: true, status: 200, data: result.data });
  } catch (error) {
    return res.status(500).send({ message: "Error during checkout", ok: false, status: 500 });
  }
};
