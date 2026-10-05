import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import { IAddToCartDto } from "./dtos/addToCart.dto";
import { ISaleLine, notifyOrderCreated } from "../../tools/notify.tool";
import { randomUUID } from "crypto";
import { Fulfillment } from "@prisma/client";
import { CheckoutInput } from "./schemas/checkout.schema";

/** Cart lines carry their product and the stand it belongs to (checkout groups by stand). */
const CART_ITEM_INCLUDE = {
  product: { include: { seller: { select: { id: true, businessName: true, location: true } } } },
} as const;

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
          include: CART_ITEM_INCLUDE,
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
      include: { items: { include: CART_ITEM_INCLUDE } },
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
      include: { items: { include: CART_ITEM_INCLUDE } },
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
      include: { items: { include: CART_ITEM_INCLUDE } },
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
  userId: string,
  delivery: CheckoutInput = { fulfillment: "pickup" }
): Promise<IServiceResponse<any>> {
  try {
    // Filled inside the transaction, dispatched only after it commits
    const notifications: { orderId: number; fulfillment: Fulfillment; sales: ISaleLine[] }[] = [];

    const result = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { userId },
        include: { items: true },
      });
      if (!cart || cart.items.length === 0) {
        return { ok: false, message: "Cart is empty" } as IServiceResponse<any>;
      }

      // Validate everything before creating anything: one short product means no order at all
      const lines: { productId: number; quantity: number; product: any }[] = [];
      for (const item of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: { seller: { select: { userId: true } } },
        });
        if (!product)
          return { ok: false, message: `Product ${item.productId} not found` } as IServiceResponse<any>;
        if (product.stock < item.quantity)
          return { ok: false, message: `Insufficient stock for product ${product.id}` } as IServiceResponse<any>;
        lines.push({ productId: item.productId, quantity: item.quantity, product });
      }

      let contactPhone = delivery.contactPhone;
      if (!contactPhone) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { phoneCountryCode: true, phoneNumber: true },
        });
        contactPhone = user ? `${user.phoneCountryCode} ${user.phoneNumber}` : "";
      }

      // One order per seller, all sharing the checkoutId of this purchase
      const bySeller = new Map<string, typeof lines>();
      for (const line of lines) {
        const sellerId = line.product.sellerId as string;
        bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), line]);
      }

      const checkoutId = randomUUID();
      const orders: any[] = [];
      for (const [sellerId, sellerLines] of bySeller) {
        const total = sellerLines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0);
        const order = await tx.order.create({
          data: {
            userId,
            sellerId,
            checkoutId,
            total,
            status: "pending",
            fulfillment: delivery.fulfillment,
            address: delivery.address ?? null,
            addressRef: delivery.addressRef ?? null,
            contactPhone,
            note: delivery.note ?? null,
          },
        });
        orders.push(order);

        const sales: ISaleLine[] = [];
        for (const l of sellerLines) {
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: l.productId,
              quantity: l.quantity,
              price: l.product.price,
            },
          });
          await tx.product.update({
            where: { id: l.productId },
            data: { stock: l.product.stock - l.quantity },
          });
          sales.push({
            sellerUserId: l.product.seller?.userId,
            productId: l.productId,
            name: l.product.name,
            quantity: l.quantity,
            stock: l.product.stock - l.quantity,
          });
        }
        notifications.push({ orderId: order.id, fulfillment: delivery.fulfillment, sales });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return {
        ok: true,
        message: "Order created",
        data: { checkoutId, orders },
      } as IServiceResponse<any>;
    });

    if (result.ok) {
      // Notifications are best-effort: they must never fail a committed order
      for (const n of notifications) {
        try {
          await notifyOrderCreated(n.orderId, n.sales, n.fulfillment);
        } catch {
          console.log(`[notify:fallback] order:new for order ${n.orderId} not delivered`);
        }
      }
    }

    return result;
  } catch (error) {
    return { ok: false, message: "Error during checkout" };
  }
}
