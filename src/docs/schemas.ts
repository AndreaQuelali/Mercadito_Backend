import * as z from "zod";
import { Category, OrderStatus, Unit, UserRole } from "@prisma/client";

/**
 * Response models (components.schemas) and the validators of endpoints that parse their
 * input by hand instead of with Zod. Request bodies of the rest are taken from the real
 * validators in each module, so they cannot drift.
 */

export type JsonSchema = Record<string, unknown>;

const dateTime: JsonSchema = { type: "string", format: "date-time" };
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });
/** Prisma Decimal values are serialized as strings by JSON.stringify */
const decimal: JsonSchema = {
  type: "string",
  pattern: "^-?\\d+(\\.\\d+)?$",
  description: "Decimal serialized as a string",
  examples: ["12.50"],
};
const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

export const componentSchemas: Record<string, JsonSchema> = {
  Error: {
    type: "object",
    required: ["ok", "status", "message"],
    properties: {
      ok: { type: "boolean", const: false },
      status: { type: "integer" },
      message: {
        description: "Human readable message. Validation details (array) are only sent when NODE_ENV=development",
        anyOf: [{ type: "string" }, { type: "array", items: { type: "object" } }],
      },
    },
  },
  AuthSession: {
    type: "object",
    required: ["id", "email", "token", "refreshToken"],
    properties: {
      id: { type: "string", format: "uuid" },
      email: { type: "string" },
      token: { type: "string", description: "Access token (JWT, 15 min). Send as `Authorization: Bearer <token>`" },
      refreshToken: { type: "string", description: "Opaque, rotating, single use. Exchange it at POST /auth/refresh" },
    },
  },
  User: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      firstName: { type: "string" },
      lastName: { type: "string" },
      phoneNumber: { type: "string" },
      phoneCountryCode: { type: "string" },
      country: { type: "string" },
      city: { type: "string" },
      email: { type: "string" },
      role: { type: "string", enum: Object.values(UserRole) },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Seller: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      userId: { type: "string", format: "uuid" },
      businessName: { type: "string" },
      description: nullable({ type: "string" }),
      avatarUrl: nullable({ type: "string" }),
      location: nullable({ type: "string" }),
      acceptsCash: { type: "boolean", description: "Accepts payment on delivery or pickup" },
      acceptsQr: { type: "boolean", description: "Accepts QR or transfer with a proof" },
      paymentQrUrl: nullable({ type: "string" }),
      paymentInstructions: nullable({ type: "string", maxLength: 500 }),
      status: { type: "string", enum: ["active", "suspended"] },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Product: {
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      price: decimal,
      stock: { type: "integer" },
      unit: { type: "string", enum: Object.values(Unit) },
      category: { type: "string", enum: Object.values(Category) },
      description: { type: "string" },
      image: { type: "string", format: "uri" },
      sellerId: { type: "string", format: "uuid" },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  SearchResults: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["hybrid", "text"], description: "\"text\" means Voyage was unavailable and only text results are returned" },
      items: {
        type: "array",
        items: { allOf: [ref("Product"), { type: "object", properties: { score: { type: "number", description: "Reciprocal Rank Fusion score, higher is better" } } }] },
      },
    },
  },
  PendingAction: {
    type: "object",
    description: "A change proposed by the assistant that waits for the user's confirmation",
    properties: {
      id: { type: "string", format: "uuid" },
      type: { type: "string", enum: ["add_to_cart", "update_cart_item", "remove_cart_item", "checkout"] },
      summary: { type: "string", description: "Human text to show next to the confirm / reject buttons", examples: ["Agregar 2 kg de Tomate (Bs 25.00)"] },
      expiresAt: { ...dateTime, description: "The proposal expires 10 minutes after it was made" },
    },
  },
  AssistantStatus: {
    type: "object",
    properties: {
      enabled: { type: "boolean", description: "false when no OPENAI_API_KEY is configured" },
      model: nullable({ type: "string" }),
    },
  },
  AssistantReply: {
    type: "object",
    properties: {
      conversationId: { type: "string", format: "uuid", description: "Send it back to continue the conversation" },
      reply: { type: "string", description: "Assistant text, in Spanish" },
      products: { type: "array", items: ref("Product"), description: "Products the read tools returned this turn" },
      pendingActions: { type: "array", items: ref("PendingAction") },
    },
  },
  AssistantConversation: {
    type: "object",
    properties: {
      conversationId: { type: "string", format: "uuid" },
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant", "action_event"] },
            content: { type: "string" },
            at: dateTime,
          },
        },
      },
      pendingActions: { type: "array", items: ref("PendingAction"), description: "Still pending and not expired" },
    },
  },
  AssistantActionResult: {
    type: "object",
    properties: {
      action: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["add_to_cart", "update_cart_item", "remove_cart_item", "checkout"] },
          status: { type: "string", enum: ["confirmed", "rejected"] },
        },
      },
      result: { description: "What the action produced: the updated cart or the created order", nullable: true },
    },
  },
  CartItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      cartId: { type: "integer" },
      productId: { type: "integer" },
      quantity: { type: "integer" },
      product: ref("Product"),
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Cart: {
    type: "object",
    properties: {
      id: { type: "integer" },
      userId: { type: "string", format: "uuid" },
      items: { type: "array", items: ref("CartItem") },
    },
  },
  OrderItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      orderId: { type: "integer" },
      productId: { type: "integer" },
      quantity: { type: "integer" },
      price: { ...decimal, description: "Unit price at purchase time, as a decimal string" },
      product: ref("Product"),
    },
  },
  Order: {
    type: "object",
    properties: {
      id: { type: "integer" },
      userId: { type: "string", format: "uuid" },
      sellerId: { type: "string", format: "uuid", description: "The stand that owns this order" },
      checkoutId: { type: "string", format: "uuid", description: "Shared by the orders of one purchase" },
      status: { type: "string", enum: Object.values(OrderStatus) },
      total: decimal,
      fulfillment: { type: "string", enum: ["pickup", "delivery"] },
      address: { ...nullable({ type: "string" }), description: "Only for delivery" },
      addressRef: nullable({ type: "string" }),
      contactPhone: { type: "string" },
      note: nullable({ type: "string", maxLength: 300 }),
      paymentMethod: { type: "string", enum: ["cash_on_delivery", "qr_transfer"] },
      paymentStatus: { type: "string", enum: ["unpaid", "proof_uploaded", "paid", "rejected"] },
      paymentProofUrl: nullable({ type: "string" }),
      paymentRejectReason: nullable({ type: "string" }),
      paidAt: nullable({ type: "string", format: "date-time" }),
      seller: { type: "object", description: "Stand data (businessName, location)" },
      items: { type: "array", items: ref("OrderItem") },
      events: { type: "array", items: ref("OrderEvent"), description: "Status history, oldest first (detail and lists)" },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  OrderEvent: {
    type: "object",
    description: "One change of the order status",
    properties: {
      id: { type: "integer" },
      orderId: { type: "integer" },
      actorId: { type: "string", format: "uuid" },
      actorRole: { type: "string", enum: ["buyer", "seller", "admin"] },
      from: { type: "string", enum: Object.values(OrderStatus) },
      to: { type: "string", enum: Object.values(OrderStatus) },
      reason: nullable({ type: "string" }),
      forced: { type: "boolean", description: "An admin skipped the normal flow" },
      createdAt: dateTime,
    },
  },
  Checkout: {
    type: "object",
    properties: {
      checkoutId: { type: "string", format: "uuid" },
      orders: { type: "array", items: ref("Order") },
    },
  },
  Purchase: {
    type: "object",
    description: "The orders of one checkout, grouped",
    properties: {
      checkoutId: { type: "string", format: "uuid" },
      createdAt: dateTime,
      fulfillment: { type: "string", enum: ["pickup", "delivery"] },
      total: { type: "number", description: "Sum of the orders" },
      orders: { type: "array", items: ref("Order") },
    },
  },
  Review: {
    type: "object",
    properties: {
      id: { type: "integer" },
      userId: { type: "string", format: "uuid" },
      productId: { type: "integer" },
      rating: { type: "integer", minimum: 1, maximum: 5 },
      comment: nullable({ type: "string" }),
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  NotificationSettings: {
    type: "object",
    required: ["preferences", "lowStockThreshold"],
    properties: {
      preferences: {
        type: "object",
        required: ["order:new", "stock:low", "review:new"],
        properties: {
          "order:new": { type: "boolean" },
          "stock:low": { type: "boolean" },
          "review:new": { type: "boolean" },
        },
      },
      lowStockThreshold: {
        type: "integer",
        description: "A sale that leaves a product at or below this stock triggers `stock:low`. Read-only",
      },
    },
  },
  SalesSummary: {
    type: "object",
    properties: {
      range: {
        type: "object",
        properties: { from: nullable({ type: "string", format: "date-time" }), to: nullable({ type: "string", format: "date-time" }) },
      },
      total: { ...decimal, description: "Revenue of the counted orders, as a decimal string" },
      ordersCount: { type: "integer", description: "Distinct orders counted as sales" },
      unitsSold: { type: "integer" },
      ordersByStatus: {
        type: "object",
        description: "Distinct orders that contain the seller's products, by status (all statuses are present)",
        properties: Object.fromEntries(Object.values(OrderStatus).map((s) => [s, { type: "integer" }])),
      },
      topProducts: {
        type: "array",
        maxItems: 5,
        description: "Best sellers by units, ties broken by revenue",
        items: {
          type: "object",
          properties: {
            productId: { type: "integer" },
            name: { type: "string" },
            image: { type: "string", description: "Product photo URL, for the thumbnail" },
            units: { type: "integer" },
            revenue: decimal,
          },
        },
      },
    },
  },
  Notification: {
    type: "object",
    properties: {
      id: { type: "integer" },
      userId: { type: "string", format: "uuid" },
      type: { type: "string", enum: ["order:status", "order:new", "stock:low", "review:new"] },
      payload: { type: "object", description: "Same payload that was emitted over Socket.IO" },
      readAt: nullable(dateTime),
      createdAt: dateTime,
    },
  },
  NotificationPage: {
    type: "object",
    properties: {
      items: { type: "array", items: ref("Notification") },
      total: { type: "integer", description: "Matches for the current filter" },
      unread: { type: "integer", description: "Unread notifications of the user" },
      page: { type: "integer" },
      limit: { type: "integer" },
    },
  },
};

// Validators for inputs that the controllers parse by hand (documentation only)

export const ProductQuerySchema = z.object({
  name: z.string().max(255).optional().describe("Case-insensitive substring of the product name"),
  category: z.nativeEnum(Category).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  startAt: z.string().optional().describe("Created at or after (ISO 8601 date)"),
  endAt: z.string().optional().describe("Created at or before (ISO 8601 date)"),
});

export const UserQuerySchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  email: z.string().max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  country: z.string().max(50).optional(),
  city: z.string().max(50).optional(),
});

export const UpdateUserBodySchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  phoneCountryCode: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
});
