import { addToCartService, checkoutService, getCartService, removeCartItemService, updateCartItemService } from "../carts/carts.service";
import { getOrderByIdService, listMyOrdersService } from "../orders/orders.service";
import { getProductByIdService } from "../products/products.service";
import { searchProductsService } from "../search/search.service";

export interface BackendResult<T = any> {
  ok: boolean;
  message: string;
  data?: T | null;
}

export interface CartLine {
  id: number;
  productId: number;
  quantity: number;
  product: any;
}

/**
 * Everything the assistant needs from the store. The default implementation delegates to the
 * existing services; the evaluation script swaps in an in-memory one so it never touches the database.
 */
export interface AssistantBackend {
  searchProducts(args: { q: string; limit: number; category?: string }): Promise<any[]>;
  getProduct(id: number): Promise<any | null>;
  getCart(userId: string): Promise<{ items: CartLine[] }>;
  listOrders(userId: string): Promise<any[]>;
  getOrder(userId: string, orderId: number): Promise<any | null>;
  addToCart(userId: string, args: { productId: number; quantity: number }): Promise<BackendResult>;
  updateCartItem(userId: string, itemId: number, quantity: number): Promise<BackendResult>;
  removeCartItem(userId: string, itemId: number): Promise<BackendResult>;
  checkout(userId: string): Promise<BackendResult>;
}

export const servicesBackend: AssistantBackend = {
  async searchProducts({ q, limit, category }) {
    const results = await searchProductsService({ q, limit, includeOutOfStock: false, category: category as any });
    return results.items;
  },
  async getProduct(id) {
    const result = await getProductByIdService(id);
    return result.ok ? (result.data as any) : null;
  },
  async getCart(userId) {
    const result = await getCartService(userId);
    if (!result.ok) throw new Error(result.message);
    return { items: (result.data?.items ?? []) as CartLine[] };
  },
  async listOrders(userId) {
    const result = await listMyOrdersService(userId);
    return result.ok ? (result.data ?? []) : []; // the service reports "no orders" as not ok
  },
  async getOrder(userId, orderId) {
    const result = await getOrderByIdService(userId, orderId);
    return result.ok ? result.data : null;
  },
  addToCart: (userId, args) => addToCartService(userId, args),
  updateCartItem: (userId, itemId, quantity) => updateCartItemService(userId, itemId, quantity),
  removeCartItem: (userId, itemId) => removeCartItemService(userId, itemId),
  checkout: (userId) => checkoutService(userId),
};
