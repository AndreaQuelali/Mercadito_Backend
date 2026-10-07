import crypto from "crypto";
import * as z from "zod";
import { Category } from "@prisma/client";
import { LlmToolDef } from "./llm";
import { AssistantBackend, CartLine } from "./backend";
import { ReadTool, ToolName, WriteTool } from "./assistant.types";

/** A tool refused to run (bad arguments, missing product...). The text goes back to the model, never a crash. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const id = z.number().int().positive();

export const toolSchemas = {
  search_products: z.object({
    q: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(10).default(5),
    category: z.enum(Category).optional(),
  }),
  get_product: z.object({ productId: id }),
  view_cart: z.object({}),
  list_my_orders: z.object({}),
  get_order: z.object({ orderId: id }),
  add_to_cart: z.object({ productId: id, quantity: z.number().int().min(1).max(100) }),
  update_cart_item: z.object({ itemId: id, quantity: z.number().int().min(1).max(100) }),
  remove_cart_item: z.object({ itemId: id }),
  checkout: z.object({}),
} satisfies Record<ToolName, z.ZodType>;

interface ToolMeta {
  kind: "read" | "write";
  description: string;
}

const meta: Record<ToolName, ToolMeta> = {
  search_products: {
    kind: "read",
    description:
      "Busca productos del catálogo de Mercadito por significado (por ejemplo 'algo para el desayuno'). Devuelve id, nombre, precio, unidad y stock. Solo productos con stock.",
  },
  get_product: { kind: "read", description: "Obtiene el detalle de un producto por su id." },
  view_cart: {
    kind: "read",
    description: "Muestra el carrito actual del usuario con sus ítems (itemId, producto, cantidad) y el total.",
  },
  list_my_orders: { kind: "read", description: "Lista los últimos pedidos del usuario con su estado y total." },
  get_order: { kind: "read", description: "Obtiene el detalle de un pedido del usuario por su id." },
  add_to_cart: {
    kind: "write",
    description:
      "Propone agregar un producto al carrito. NO lo agrega: queda pendiente hasta que el usuario lo confirme con un botón.",
  },
  update_cart_item: {
    kind: "write",
    description:
      "Propone cambiar la cantidad de un ítem del carrito (usa el itemId de view_cart). NO lo cambia hasta que el usuario lo confirme.",
  },
  remove_cart_item: {
    kind: "write",
    description:
      "Propone quitar un ítem del carrito (usa el itemId de view_cart). NO lo quita hasta que el usuario lo confirme.",
  },
  checkout: {
    kind: "write",
    description:
      "Propone hacer el pedido con todo lo que hay en el carrito. NO crea el pedido hasta que el usuario lo confirme.",
  },
};

export const isWriteTool = (name: string): name is WriteTool => meta[name as ToolName]?.kind === "write";
export const isToolName = (name: string): name is ToolName => Object.prototype.hasOwnProperty.call(meta, name);

/** Tool definitions for the model (JSON Schema derived from the Zod schemas) */
export function llmToolDefs(): LlmToolDef[] {
  return (Object.keys(meta) as ToolName[]).map((name) => {
    const { $schema, ...parameters } = z.toJSONSchema(toolSchemas[name], {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    return { name, description: meta[name].description, parameters };
  });
}

// ---------- helpers ----------

const money = (value: unknown) => Number(String(value ?? 0));
const bs = (value: number) => `Bs ${value.toFixed(2)}`;
const UNIT_LABEL: Record<string, string> = { kilogramo: "kg", unidad: "u.", frasco: "frasco(s)", litro: "L" };
const unitLabel = (unit: unknown) => UNIT_LABEL[String(unit)] ?? String(unit ?? "");

/** Fields the model needs; descriptions are cut so a long one cannot flood the context */
export function trimProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    price: money(p.price),
    unit: p.unit,
    stock: p.stock,
    category: p.category,
    description: String(p.description ?? "").slice(0, 300),
  };
}

function trimCart(items: CartLine[]) {
  const lines = items.map((i) => ({
    itemId: i.id,
    productId: i.productId,
    name: i.product?.name,
    unit: i.product?.unit,
    quantity: i.quantity,
    unitPrice: money(i.product?.price),
    subtotal: money(i.product?.price) * i.quantity,
    stock: i.product?.stock,
  }));
  return { items: lines, total: lines.reduce((sum, l) => sum + l.subtotal, 0) };
}

function trimOrder(o: any) {
  return {
    id: o.id,
    status: o.status,
    total: money(o.total),
    createdAt: o.createdAt,
    items: (o.items ?? []).map((i: any) => ({
      productId: i.productId,
      name: i.product?.name,
      quantity: i.quantity,
      price: money(i.price),
    })),
  };
}

/** Hash of what the cart holds, so a checkout confirmation can tell the cart changed */
export function cartFingerprint(items: Pick<CartLine, "productId" | "quantity">[]): string {
  const canonical = items
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export interface ToolContext {
  userId: string;
  backend: AssistantBackend;
}

export function parseArgs<N extends ToolName>(name: N, args: unknown): z.output<(typeof toolSchemas)[N]> {
  const parsed = toolSchemas[name].safeParse(args);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "argumentos"}: ${i.message}`).join("; ");
    throw new ToolError(`Argumentos inválidos para ${name}: ${detail}`);
  }
  return parsed.data as any;
}

// ---------- read tools: run right away, always as the session user ----------

export interface ReadResult {
  output: unknown;
  /** Raw product records, returned to the client next to the reply */
  products: Record<string, unknown>[];
}

export async function runReadTool(name: ReadTool, rawArgs: unknown, ctx: ToolContext): Promise<ReadResult> {
  const { userId, backend } = ctx;
  switch (name) {
    case "search_products": {
      const args = parseArgs(name, rawArgs);
      const found = await backend.searchProducts({ q: args.q, limit: args.limit, category: args.category });
      return { output: { products: found.map(trimProduct) }, products: found };
    }
    case "get_product": {
      const { productId } = parseArgs(name, rawArgs);
      const product = await backend.getProduct(productId);
      if (!product) throw new ToolError(`No existe el producto ${productId}.`);
      return { output: { product: trimProduct(product) }, products: [product] };
    }
    case "view_cart": {
      parseArgs(name, rawArgs);
      return { output: trimCart((await backend.getCart(userId)).items), products: [] };
    }
    case "list_my_orders": {
      parseArgs(name, rawArgs);
      const orders = await backend.listOrders(userId);
      return { output: { orders: orders.slice(0, 10).map(trimOrder) }, products: [] };
    }
    case "get_order": {
      const { orderId } = parseArgs(name, rawArgs);
      const order = await backend.getOrder(userId, orderId);
      if (!order) throw new ToolError(`No existe el pedido ${orderId}.`);
      return { output: { order: trimOrder(order) }, products: [] };
    }
  }
}

// ---------- write tools: validate and describe, never modify anything ----------

export interface Proposal {
  args: Record<string, unknown>;
  summary: string;
  cartFingerprint?: string;
}

export async function proposeWriteTool(name: WriteTool, rawArgs: unknown, ctx: ToolContext): Promise<Proposal> {
  const { userId, backend } = ctx;
  switch (name) {
    case "add_to_cart": {
      const args = parseArgs(name, rawArgs);
      const product = await backend.getProduct(args.productId);
      if (!product) throw new ToolError(`No existe el producto ${args.productId}.`);
      const inCart = (await backend.getCart(userId)).items.find((i) => i.productId === args.productId)?.quantity ?? 0;
      if (product.stock < args.quantity + inCart) {
        throw new ToolError(
          `Stock insuficiente de ${product.name}: hay ${product.stock} y ya tienes ${inCart} en el carrito.`
        );
      }
      return {
        args,
        summary: `Agregar ${args.quantity} ${unitLabel(product.unit)} de ${product.name} (${bs(money(product.price) * args.quantity)})`,
      };
    }
    case "update_cart_item": {
      const args = parseArgs(name, rawArgs);
      const line = (await backend.getCart(userId)).items.find((i) => i.id === args.itemId);
      if (!line) throw new ToolError(`El ítem ${args.itemId} no está en el carrito del usuario.`);
      if (line.product && line.product.stock < args.quantity) {
        throw new ToolError(`Stock insuficiente de ${line.product.name}: hay ${line.product.stock}.`);
      }
      return {
        args,
        summary: `Cambiar a ${args.quantity} ${unitLabel(line.product?.unit)} de ${line.product?.name} (${bs(money(line.product?.price) * args.quantity)})`,
      };
    }
    case "remove_cart_item": {
      const args = parseArgs(name, rawArgs);
      const line = (await backend.getCart(userId)).items.find((i) => i.id === args.itemId);
      if (!line) throw new ToolError(`El ítem ${args.itemId} no está en el carrito del usuario.`);
      return { args, summary: `Quitar ${line.product?.name} del carrito` };
    }
    case "checkout": {
      const args = parseArgs(name, rawArgs);
      const { items } = await backend.getCart(userId);
      if (items.length === 0) throw new ToolError("El carrito está vacío.");
      const short = items.find((i) => i.product && i.product.stock < i.quantity);
      if (short) throw new ToolError(`Stock insuficiente de ${short.product.name}: hay ${short.product.stock}.`);
      const cart = trimCart(items);
      const detail = cart.items.map((l) => `${l.quantity} ${unitLabel(l.unit)} de ${l.name}`).join(", ");
      return {
        args,
        summary: `Hacer el pedido (retiro en el puesto): ${detail}. Total ${bs(cart.total)}`,
        cartFingerprint: cartFingerprint(items),
      };
    }
  }
}
