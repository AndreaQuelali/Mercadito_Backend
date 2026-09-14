import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { IAddToCartDto } from "./dtos/addToCart.dto";

export async function getOrCreateCart(userId: string) {
  let cart = await prisma.cart.findFirst({ where: { userId } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId } });
  }
  return cart;
}

export async function getCartService(
  userId: string
): Promise<IServiceResponse<any>> {
  try {
    const cart = await prisma.cart.findFirst({
      where: { userId },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    // Return an empty cart object instead of an error — frontend handles empty state
    if (!cart) {
      return { ok: true, message: "Cart is empty", data: { items: [] } };
    }

    return { ok: true, message: "Cart fetched", data: cart };
  } catch (error) {
    return { ok: false, message: "Error fetching cart" };
  }
}

export async function addToCartService(
  userId: string,
  payload: IAddToCartDto
): Promise<IServiceResponse<any>> {
  try {
    const { productId, quantity } = payload;
    if (quantity <= 0) return { ok: false, message: "Quantity must be >= 1" };

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return { ok: false, message: "Product not found" };

    // Validate stock before adding to cart
    if (product.stock < quantity) {
      return {
        ok: false,
        message: `Insufficient stock. Available: ${product.stock}`,
      };
    }

    const cart = await getOrCreateCart(userId);

    const existing = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId },
    });

    let item;
    if (existing) {
      const newQty = existing.quantity + quantity;
      // Re-check stock against total desired quantity
      if (product.stock < newQty) {
        return {
          ok: false,
          message: `Insufficient stock. Available: ${product.stock}, already in cart: ${existing.quantity}`,
        };
      }
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      item = await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity },
      });
    }

    const full = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    return { ok: true, message: "Added to cart", data: full };
  } catch (error) {
    return { ok: false, message: "Error adding to cart" };
  }
}

export async function removeCartItemService(
  userId: string,
  itemId: number
): Promise<IServiceResponse<any>> {
  try {
    const cart = await prisma.cart.findFirst({ where: { userId } });
    if (!cart) return { ok: false, message: "Cart not found" };

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) return { ok: false, message: "Item not found in cart" };

    await prisma.cartItem.delete({ where: { id: itemId } });

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    return { ok: true, message: "Item removed from cart", data: updated };
  } catch (error) {
    return { ok: false, message: "Error removing cart item" };
  }
}

export async function updateCartItemService(
  userId: string,
  itemId: number,
  quantity: number
): Promise<IServiceResponse<any>> {
  try {
    const cart = await prisma.cart.findFirst({ where: { userId } });
    if (!cart) return { ok: false, message: "Cart not found" };

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { product: true },
    });
    if (!item) return { ok: false, message: "Item not found in cart" };

    // Validate stock before updating quantity
    if ((item as any).product.stock < quantity) {
      return {
        ok: false,
        message: `Insufficient stock. Available: ${(item as any).product.stock}`,
      };
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    return { ok: true, message: "Cart item updated", data: updated };
  } catch (error) {
    return { ok: false, message: "Error updating cart item" };
  }
}

export async function clearCartService(
  userId: string
): Promise<IServiceResponse<any>> {
  try {
    const cart = await prisma.cart.findFirst({ where: { userId } });
    if (!cart) return { ok: false, message: "Cart not found" };

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return { ok: true, message: "Cart cleared", data: { items: [] } };
  } catch (error) {
    return { ok: false, message: "Error clearing cart" };
  }
}

export async function checkoutService(
  userId: string
): Promise<IServiceResponse<any>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { userId },
        include: { items: true },
      });
      if (!cart || cart.items.length === 0) {
        return { ok: false, message: "Cart is empty" } as IServiceResponse<any>;
      }

      let total = 0;
      for (const item of cart.items) {
        const p = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!p)
          return {
            ok: false,
            message: `Product ${item.productId} not found`,
          } as IServiceResponse<any>;
        if (p.stock < item.quantity)
          return {
            ok: false,
            message: `Insufficient stock for product ${p.id}`,
          } as IServiceResponse<any>;
        total += Number(p.price) * item.quantity;
      }

      const order = await tx.order.create({
        data: { userId, total, status: "pending" },
      });

      for (const item of cart.items) {
        const p = await tx.product.findUnique({
          where: { id: item.productId },
        });
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: p!.price,
          },
        });
        await tx.product.update({
          where: { id: p!.id },
          data: { stock: p!.stock - item.quantity },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return {
        ok: true,
        message: "Order created",
        data: order,
      } as IServiceResponse<any>;
    });

    return result;
  } catch (error) {
    return { ok: false, message: "Error during checkout" };
  }
}
