import { AssistantBackend, BackendResult, CartLine } from "./backend";

export interface MemoryProduct {
  id: number;
  name: string;
  price: number;
  stock: number;
  unit: string;
  category: string;
  description: string;
}

/**
 * In-memory store with the same rules as the real services. Used by the evaluation script and by
 * the tests, so neither touches the database. `writes` counts every state change, which lets a
 * test assert that "nothing was executed".
 */
export function createMemoryBackend(initial: MemoryProduct[]) {
  const products = new Map(initial.map((p) => [p.id, { ...p }]));
  const carts = new Map<string, CartLine[]>();
  const orders: any[] = [];
  let nextItemId = 1;
  let nextOrderId = 1;
  const state = { writes: 0 };

  const cartOf = (userId: string) => {
    if (!carts.has(userId)) carts.set(userId, []);
    return carts.get(userId)!;
  };
  const fail = (message: string): BackendResult => ({ ok: false, message });
  const cartData = (userId: string) => ({ items: cartOf(userId).map((l) => ({ ...l, product: { ...products.get(l.productId) } })) });

  const backend: AssistantBackend = {
    async searchProducts({ q, limit, category }) {
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      return [...products.values()]
        .filter((p) => p.stock > 0 && (!category || p.category === category))
        .filter((p) => {
          const text = `${p.name} ${p.description} ${p.category}`.toLowerCase();
          return words.length === 0 ? text.includes(q.toLowerCase()) : words.some((w) => text.includes(w.replace(/s$/, "")));
        })
        .slice(0, limit)
        .map((p) => ({ ...p }));
    },
    async getProduct(id) {
      const p = products.get(id);
      return p ? { ...p } : null;
    },
    async getCart(userId) {
      return cartData(userId);
    },
    async listOrders(userId) {
      return orders.filter((o) => o.userId === userId);
    },
    async getOrder(userId, orderId) {
      return orders.find((o) => o.id === orderId && o.userId === userId) ?? null;
    },
    async addToCart(userId, { productId, quantity }) {
      const p = products.get(productId);
      if (!p) return fail("Product not found");
      const line = cartOf(userId).find((l) => l.productId === productId);
      if (p.stock < quantity + (line?.quantity ?? 0)) return fail(`Insufficient stock. Available: ${p.stock}`);
      state.writes++;
      if (line) line.quantity += quantity;
      else cartOf(userId).push({ id: nextItemId++, productId, quantity, product: null });
      return { ok: true, message: "Added to cart", data: cartData(userId) };
    },
    async updateCartItem(userId, itemId, quantity) {
      const line = cartOf(userId).find((l) => l.id === itemId);
      if (!line) return fail("Item not found in cart");
      if (products.get(line.productId)!.stock < quantity) return fail("Insufficient stock");
      state.writes++;
      line.quantity = quantity;
      return { ok: true, message: "Cart item updated", data: cartData(userId) };
    },
    async removeCartItem(userId, itemId) {
      const cart = cartOf(userId);
      const index = cart.findIndex((l) => l.id === itemId);
      if (index === -1) return fail("Item not found in cart");
      state.writes++;
      cart.splice(index, 1);
      return { ok: true, message: "Item removed from cart", data: cartData(userId) };
    },
    async checkout(userId) {
      const cart = cartOf(userId);
      if (cart.length === 0) return fail("Cart is empty");
      for (const l of cart) if (products.get(l.productId)!.stock < l.quantity) return fail("Insufficient stock");
      state.writes++;
      const items = cart.map((l) => ({ productId: l.productId, quantity: l.quantity, price: products.get(l.productId)!.price, product: { ...products.get(l.productId) } }));
      for (const l of cart) products.get(l.productId)!.stock -= l.quantity;
      const order = { id: nextOrderId++, userId, status: "pending", total: items.reduce((s, i) => s + i.price * i.quantity, 0), createdAt: new Date().toISOString(), items };
      orders.push(order);
      carts.set(userId, []);
      return { ok: true, message: "Order created", data: order };
    },
  };

  return { backend, state, products, orders, cartOf };
}
