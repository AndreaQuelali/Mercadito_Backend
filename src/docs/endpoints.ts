import * as z from "zod";
import { LoginSchema } from "../modules/auth/schemas/login.schema";
import { RegisterSchema } from "../modules/auth/schemas/register.schema";
import { RefreshSchema } from "../modules/auth/schemas/refresh.schema";
import { ForgotPasswordSchema } from "../modules/auth/schemas/forgotPassword.schema";
import { ResetPasswordSchema } from "../modules/auth/schemas/resetPassword.schema";
import { AddToCartSchema } from "../modules/carts/schemas/addToCart.schema";
import { UpdateCartItemSchema } from "../modules/carts/schemas/updateCartItem.schema";
import { ListNotificationsQuerySchema } from "../modules/notifications/schemas/listNotifications.schema";
import { CheckoutSchema } from "../modules/carts/schemas/checkout.schema";
import { UpdateOrderStatusSchema } from "../modules/orders/schemas/updateOrderStatus.schema";
import { SendMessageSchema } from "../modules/assistant/assistant.schemas";
import { SearchQuerySchema } from "../modules/search/schemas/searchQuery.schema";
import { CreateProductSchema } from "../modules/products/schemas/createProduct.schema";
import { UpdateProductSchema } from "../modules/products/schemas/updateProduct.schema";
import { CreateReviewSchema } from "../modules/reviews/schemas/createReview.schema";
import {
  CreateSellerSchema,
  UpdateSellerSchema,
  UpdateSellerStatusSchema,
} from "../modules/sellers/schemas/seller.schema";
import { SalesQuerySchema } from "../modules/sellers/schemas/sales.schema";
import { NotificationSettingsSchema } from "../modules/sellers/schemas/notificationSettings.schema";
import { JsonSchema, ProductQuerySchema, UpdateUserBodySchema, UserQuerySchema } from "./schemas";

/**
 * Who can call an operation (what the middlewares in each routes file enforce):
 * - public: no token
 * - user: any valid access token
 * - seller: token + a Seller profile (active or suspended)
 * - activeSeller: token + an active Seller profile
 * - admin: token + role admin
 * - adminOrActiveSeller: admin, or an active seller touching their own data
 */
export type Access = "public" | "user" | "seller" | "activeSeller" | "admin" | "adminOrActiveSeller";

export interface Endpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Express style path, as mounted in server.routes.ts */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  /** Type of each path parameter; defaults to integer */
  params?: Record<string, "integer" | "uuid">;
  query?: z.ZodType;
  body?: z.ZodType;
  bodyExample?: unknown;
  response?: {
    status?: number;
    description?: string;
    /** Schema of `data` in the `{ ok, status, message, data }` envelope */
    data?: JsonSchema;
    /** Extra top-level properties next to `data` (e.g. `token`) */
    extra?: Record<string, JsonSchema>;
    /** Plain text body instead of the JSON envelope */
    text?: string;
  };
  /** Error statuses this operation can return besides the ones implied by access/body/500 */
  errors?: number[];
}

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });
const list = (name: string): JsonSchema => ({ type: "array", items: ref(name) });

export const tags = [
  { name: "Health", description: "Liveness probe" },
  { name: "Auth", description: "Registration, sessions (access + rotating refresh token) and password recovery" },
  { name: "Sellers", description: "Seller profile of an account; admin moderation" },
  { name: "Products", description: "Catalog and product management" },
  { name: "Cart", description: "Shopping cart and checkout" },
  { name: "Orders", description: "Orders of the buyer and of the seller" },
  { name: "Reviews", description: "Reviews, only after the order was delivered" },
  { name: "Users", description: "Profiles and user administration" },
  { name: "Notifications", description: "History of the real-time events (see the Socket.IO section of the README)" },
];

export const endpoints: Endpoint[] = [
  // Health
  {
    method: "get", path: "/health", tag: "Health", summary: "Health check", access: "public",
    response: { text: "OK", description: "The server is up" },
  },

  // Auth
  {
    method: "post", path: "/auth/register", tag: "Auth", summary: "Register a new account", access: "public",
    body: RegisterSchema,
    bodyExample: {
      firstName: "Ana", lastName: "Quispe", email: "ana@example.com", password: "Secreto#123",
      phoneNumber: "71234567", phoneCountryCode: "+591", country: "Bolivia", city: "La Paz",
    },
    response: {
      status: 201, description: "Account created",
      data: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string" } } },
    },
  },
  {
    method: "post", path: "/auth/login", tag: "Auth", summary: "Log in", access: "public",
    description: "Returns a 15 minute access token and a refresh token (7 days, single use).",
    body: LoginSchema,
    bodyExample: { email: "ana@example.com", password: "Secreto#123" },
    response: { description: "Authenticated", data: ref("AuthSession") },
    errors: [401],
  },
  {
    method: "post", path: "/auth/refresh", tag: "Auth", summary: "Renew the session", access: "public",
    description:
      "Consumes the refresh token and returns a new access token plus a new refresh token. " +
      "Using an already used refresh token revokes the whole session. A 500 means a temporary " +
      "failure: keep the current session and retry.",
    body: RefreshSchema,
    bodyExample: { refreshToken: "d4f1...e9" },
    response: { description: "Session renewed", data: ref("AuthSession") },
    errors: [401],
  },
  {
    method: "post", path: "/auth/logout", tag: "Auth", summary: "Log out (revoke the session)", access: "public",
    description: "Idempotent: it succeeds even if the refresh token was already revoked.",
    body: RefreshSchema,
    bodyExample: { refreshToken: "d4f1...e9" },
    response: { description: "Session revoked" },
  },
  {
    method: "post", path: "/auth/password/forgot", tag: "Auth", summary: "Request a password reset email", access: "public",
    description: "Always answers 200 so the existence of an email is not disclosed.",
    body: ForgotPasswordSchema,
    bodyExample: { email: "ana@example.com" },
    response: { description: "If the email exists, a reset link was sent" },
  },
  {
    method: "post", path: "/auth/password/reset", tag: "Auth", summary: "Set a new password with a reset token", access: "public",
    body: ResetPasswordSchema,
    bodyExample: { token: "3f9a...c2", newPassword: "NuevoSecreto#456" },
    response: { description: "Password updated" },
  },

  // Sellers
  {
    method: "post", path: "/seller", tag: "Sellers", summary: "Create my seller profile", access: "user",
    description: "The response includes a new access token that already carries `sellerId`.",
    body: CreateSellerSchema,
    bodyExample: { businessName: "Puesto de Ana", description: "Verduras frescas", location: "Pasillo 3" },
    response: { status: 201, description: "Seller created", data: ref("Seller"), extra: { token: { type: "string" } } },
    errors: [409],
  },
  {
    method: "get", path: "/seller/mine", tag: "Sellers", summary: "Get my seller profile", access: "seller",
    response: { description: "My seller profile", data: ref("Seller") },
    errors: [404],
  },
  {
    method: "patch", path: "/seller/mine", tag: "Sellers", summary: "Update my seller profile", access: "seller",
    body: UpdateSellerSchema,
    bodyExample: { description: "Verduras y frutas frescas" },
    response: { description: "Seller updated", data: ref("Seller") },
  },
  {
    method: "delete", path: "/seller/mine", tag: "Sellers", summary: "Delete my seller profile", access: "activeSeller",
    description: "Refused with 409 while the seller still has products.",
    response: { description: "Seller deleted", data: ref("Seller") },
    errors: [400, 409],
  },
  {
    method: "get", path: "/seller/notification-settings", tag: "Sellers",
    summary: "Get my notification settings", access: "seller",
    description:
      "Which seller events I receive (`order:new`, `stock:low`, `review:new`; all on by default) and the " +
      "low stock threshold, which the server defines (`LOW_STOCK_THRESHOLD`) and sellers cannot change.",
    response: { description: "My notification settings", data: ref("NotificationSettings") },
    errors: [404],
  },
  {
    method: "patch", path: "/seller/notification-settings", tag: "Sellers",
    summary: "Turn seller notifications on or off", access: "seller",
    description:
      "Partial update: send only the events to change. A turned-off event is neither emitted over Socket.IO " +
      "nor stored in the history. `order:status` is part of the order flow and cannot be turned off.",
    body: NotificationSettingsSchema,
    bodyExample: { "stock:low": false },
    response: { description: "Updated settings", data: ref("NotificationSettings") },
    errors: [404],
  },
  {
    method: "get", path: "/seller/sales", tag: "Sellers", summary: "Sales summary of my store", access: "seller",
    description:
      "Revenue and units come from the seller's own items in orders that are `paid`, `confirmed`, `shipped` or " +
      "`delivered`; `pending` and `cancelled` orders are not sales (they still show in `ordersByStatus`). " +
      "The range filters by the creation date of the order. Without filters it covers all time.",
    query: SalesQuerySchema,
    response: { description: "Sales summary", data: ref("SalesSummary") },
  },
  {
    method: "get", path: "/seller", tag: "Sellers", summary: "List all sellers", access: "admin",
    response: { description: "Sellers", data: list("Seller") },
    errors: [400],
  },
  {
    method: "patch", path: "/seller/:id/status", tag: "Sellers",
    summary: "Activate or suspend a seller", access: "admin",
    params: { id: "uuid" },
    body: UpdateSellerStatusSchema,
    bodyExample: { status: "suspended" },
    response: { description: "Status updated", data: ref("Seller") },
    errors: [404],
  },

  // Products
  {
    method: "get", path: "/product", tag: "Products", summary: "List products", access: "public",
    description: "Returns an empty array when nothing matches.",
    query: ProductQuerySchema,
    response: { description: "Products, newest first", data: list("Product") },
    errors: [400],
  },
  {
    method: "get", path: "/product/search", tag: "Products", summary: "Search products (semantic + text)", access: "user",
    description:
      "Hybrid search: a vector ranking (Voyage embeddings in pgvector, only candidates above a minimum similarity) and a " +
      "Spanish full-text ranking, merged with Reciprocal Rank Fusion. When embeddings are unavailable it answers with " +
      "text results only and `mode: \"text\"`. Products without stock are excluded unless `includeOutOfStock=true`. " +
      "Limited per user and minute: the 429 response carries a `Retry-After` header.",
    query: SearchQuerySchema,
    response: { description: "Ranked products", data: ref("SearchResults") },
    errors: [400, 429],
  },
  {
    method: "get", path: "/product/mine", tag: "Products", summary: "List my products", access: "seller",
    response: { description: "Products of my store", data: list("Product") },
    errors: [404],
  },
  {
    method: "get", path: "/product/:id", tag: "Products", summary: "Get a product", access: "public",
    response: { description: "The product", data: ref("Product") },
    errors: [400, 404],
  },
  {
    method: "post", path: "/product", tag: "Products", summary: "Create a product", access: "activeSeller",
    body: CreateProductSchema,
    bodyExample: {
      name: "Tomate", price: 12.5, stock: 40, unit: "kilogramo", category: "verduras",
      description: "Tomate fresco de valle", image: "https://example.com/tomate.jpg",
    },
    response: { status: 201, description: "Product created", data: ref("Product") },
  },
  {
    method: "put", path: "/product/:id", tag: "Products", summary: "Update my product", access: "activeSeller",
    description: "All fields are optional. Only the owner can update it.",
    body: UpdateProductSchema,
    bodyExample: { price: 11, stock: 35 },
    response: { description: "Product updated", data: ref("Product") },
    errors: [404],
  },
  {
    method: "delete", path: "/product/:id", tag: "Products", summary: "Delete my product", access: "activeSeller",
    response: { description: "Product deleted", data: ref("Product") },
    errors: [400, 404],
  },

  // Cart
  {
    method: "get", path: "/cart", tag: "Cart", summary: "Get my cart", access: "user",
    description: "An empty cart is returned as `{ items: [] }`, not as an error.",
    response: { description: "My cart", data: ref("Cart") },
  },
  {
    method: "post", path: "/cart/add", tag: "Cart", summary: "Add a product to the cart", access: "user",
    description: "Quantities are summed when the product is already in the cart. Stock is validated.",
    body: AddToCartSchema,
    bodyExample: { productId: 1, quantity: 2 },
    response: { description: "Updated cart", data: ref("Cart") },
  },
  {
    method: "post", path: "/cart/checkout", tag: "Cart", summary: "Create the orders of the cart (one per stand)", access: "user",
    description:
      "Runs in a transaction: validates stock, creates **one order per stand** with products in the cart (all sharing " +
      "a `checkoutId`), decrements stock and empties the cart. If any product lacks stock nothing is created. " +
      "`delivery` requires `address` and `addressRef`; `pickup` ignores them. `contactPhone` defaults to the profile phone. " +
      "Each seller is notified with `order:new` (and `stock:low`). 400: invalid delivery data, empty cart or no stock.",
    body: CheckoutSchema,
    bodyExample: { fulfillment: "delivery", address: "Av. Siempre Viva 123", addressRef: "Portón verde, frente a la panadería", note: "Tocar el timbre" },
    response: { status: 201, description: "Orders created", data: ref("Checkout") },
    errors: [400],
  },
  {
    method: "delete", path: "/cart", tag: "Cart", summary: "Empty my cart", access: "user",
    response: {
      description: "Cart emptied",
      data: { type: "object", properties: { items: { type: "array", maxItems: 0 } } },
    },
    errors: [400],
  },
  {
    method: "delete", path: "/cart/item/:itemId", tag: "Cart", summary: "Remove an item from the cart", access: "user",
    response: { description: "Updated cart", data: ref("Cart") },
    errors: [400],
  },
  {
    method: "patch", path: "/cart/item/:itemId", tag: "Cart", summary: "Change the quantity of a cart item", access: "user",
    body: UpdateCartItemSchema,
    bodyExample: { quantity: 3 },
    response: { description: "Updated cart", data: ref("Cart") },
  },

  // Orders
  {
    method: "get", path: "/order", tag: "Orders", summary: "List my purchases", access: "user",
    description: "Orders grouped by purchase (`checkoutId`), newest first, one order per stand. Answers 400 when the user has no orders.",
    response: { description: "My purchases", data: list("Purchase") },
    errors: [400],
  },
  {
    method: "get", path: "/order/seller/mine", tag: "Orders", summary: "List the orders of my stand", access: "seller",
    response: { description: "Orders of my store", data: list("Order") },
    errors: [400],
  },
  {
    method: "get", path: "/order/:id", tag: "Orders", summary: "Get one of my orders", access: "user",
    response: { description: "The order", data: ref("Order") },
    errors: [404],
  },
  {
    method: "patch", path: "/order/:id/status", tag: "Orders", summary: "Change the status of an order", access: "adminOrActiveSeller",
    description:
      "A seller can only update the orders of their own stand (403 otherwise). Moving to `confirmed` emails the buyer " +
      "(mentioning pickup or delivery) and emits `order:status` to the buyer and to the seller.",
    body: UpdateOrderStatusSchema,
    bodyExample: { status: "confirmed" },
    response: { description: "Order updated", data: ref("Order") },
    errors: [404],
  },

  // Reviews
  {
    method: "get", path: "/review/product/:productId", tag: "Reviews", summary: "List the reviews of a product", access: "public",
    response: { description: "Reviews, newest first", data: list("Review") },
    errors: [400],
  },
  {
    method: "post", path: "/review", tag: "Reviews", summary: "Review a product", access: "user",
    description: "Only after an order with that product reached `delivered`. One review per user and product.",
    body: CreateReviewSchema,
    bodyExample: { productId: 1, rating: 5, comment: "Excelente" },
    response: { status: 201, description: "Review created", data: ref("Review") },
  },

  // Users
  {
    method: "get", path: "/user/profile", tag: "Users", summary: "Get my profile", access: "user",
    response: { description: "My profile", data: ref("User") },
    errors: [400],
  },
  {
    method: "get", path: "/user", tag: "Users", summary: "List users", access: "admin",
    description: "At most 100 results. Invalid filter values are ignored.",
    query: UserQuerySchema,
    response: { description: "Users", data: list("User") },
    errors: [400],
  },
  {
    method: "get", path: "/user/:id", tag: "Users", summary: "Get a user", access: "user",
    params: { id: "uuid" },
    response: { description: "The user", data: ref("User") },
    errors: [404],
  },
  {
    method: "patch", path: "/user/:id", tag: "Users", summary: "Update a user", access: "admin",
    params: { id: "uuid" },
    body: UpdateUserBodySchema,
    bodyExample: { city: "Cochabamba" },
    response: { description: "User updated", data: ref("User") },
  },
  {
    method: "delete", path: "/user/:id", tag: "Users", summary: "Delete a user", access: "admin",
    params: { id: "uuid" },
    response: { description: "User deleted", data: ref("User") },
    errors: [404],
  },

  // Assistant
  {
    method: "get", path: "/assistant/status", tag: "Assistant", summary: "Is the shopping assistant enabled?", access: "public",
    description: "Public, so the UI can decide whether to show the assistant before login. `enabled` is false when no `OPENAI_API_KEY` is configured; in that case `POST /assistant/messages` answers 503.",
    response: { description: "Assistant status", data: ref("AssistantStatus") },
  },
  {
    method: "get", path: "/assistant/conversations/:id", tag: "Assistant", summary: "Resume a conversation", access: "user",
    description:
      "Returns the visible messages (`user`, `assistant`, `action_event`) and the actions still waiting for confirmation, so the " +
      "chat can be restored after a reload. Internal tool calls and results are never returned. 404: unknown, expired (24 h) or not yours.",
    params: { id: "uuid" },
    response: { description: "The conversation", data: ref("AssistantConversation") },
    errors: [404],
  },
  {
    method: "post", path: "/assistant/messages", tag: "Assistant", summary: "Send a message to the shopping assistant", access: "user",
    description:
      "The model can search the catalog and read the user's cart and orders. Anything that changes data (add / change / remove " +
      "cart items, checkout) only comes back as an entry of `pendingActions`; nothing is executed until the user calls " +
      "`POST /assistant/actions/{id}/confirm`. Without `conversationId` a new conversation starts. Limited per user and minute " +
      "(429 with `Retry-After`). 404: the conversation does not exist, expired or is not yours. 503: the assistant is disabled or the model failed.",
    body: SendMessageSchema,
    bodyExample: { message: "agrega 2 kg de tomates" },
    response: { description: "The assistant's reply", data: ref("AssistantReply") },
    errors: [404, 429, 503],
  },
  {
    method: "post", path: "/assistant/actions/:id/confirm", tag: "Assistant", summary: "Confirm an action proposed by the assistant", access: "user",
    description:
      "Executes the action exactly once, as the logged-in user. 404: unknown, expired or someone else's. 409: already resolved, " +
      "or (checkout) the cart changed since the proposal. 400: the action no longer applies (e.g. not enough stock now).",
    params: { id: "uuid" },
    response: { description: "The action and what it produced", data: ref("AssistantActionResult") },
    errors: [400, 404, 409],
  },
  {
    method: "post", path: "/assistant/actions/:id/reject", tag: "Assistant", summary: "Reject an action proposed by the assistant", access: "user",
    description: "Discards the proposal without executing anything. The assistant sees the rejection on its next turn.",
    params: { id: "uuid" },
    response: { description: "The rejected action", data: ref("AssistantActionResult") },
    errors: [404, 409],
  },

  // Notifications
  {
    method: "get", path: "/notification", tag: "Notifications", summary: "List my notifications", access: "user",
    query: ListNotificationsQuerySchema,
    response: { description: "A page of notifications, newest first", data: ref("NotificationPage") },
  },
  {
    method: "patch", path: "/notification/read-all", tag: "Notifications", summary: "Mark all my notifications as read", access: "user",
    response: {
      description: "Notifications marked as read",
      data: { type: "object", properties: { updated: { type: "integer" } } },
    },
  },
  {
    method: "patch", path: "/notification/:id/read", tag: "Notifications", summary: "Mark a notification as read", access: "user",
    description: "Idempotent. A notification of another user answers 404.",
    response: { description: "The notification", data: ref("Notification") },
    errors: [400, 404],
  },
];
