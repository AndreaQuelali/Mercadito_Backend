export type ReadTool = "search_products" | "get_product" | "view_cart" | "list_my_orders" | "get_order";
export type WriteTool = "add_to_cart" | "update_cart_item" | "remove_cart_item" | "checkout";
export type ToolName = ReadTool | WriteTool;

/** Redis: assistant:conv:<conversationId>  (JSON, TTL 24 h, renewed on every message) */
export interface Conversation {
  id: string;
  /** Owner; another user gets 404 */
  userId: string;
  /** Full history; only the last 20 go to the model */
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export type ConversationMessage =
  | { role: "user"; content: string; at: string }
  | { role: "assistant"; content: string; at: string }
  | { role: "tool_call"; callId: string; name: ToolName; args: unknown; at: string }
  | { role: "tool_result"; callId: string; output: unknown; at: string }
  // Appended when the user confirms or rejects, so the model knows on the next turn
  | {
      role: "action_event";
      actionId: string;
      outcome: "confirmed" | "rejected" | "failed";
      detail: string;
      at: string;
    };

/** Redis: assistant:action:<id>  (JSON, TTL 10 min) */
export interface PendingAction {
  id: string;
  userId: string;
  conversationId: string;
  type: WriteTool;
  /** Validated with the tool's Zod schema */
  args: Record<string, unknown>;
  /** Human text shown in the UI, e.g. "Agregar 2 kg de Tomate (Bs 25.00)" */
  summary: string;
  /** checkout only: hash of the cart items at proposal time */
  cartFingerprint?: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  expiresAt: string;
}

export interface PendingActionView {
  id: string;
  type: WriteTool;
  summary: string;
  expiresAt: string;
}

export interface AssistantReply {
  conversationId: string;
  reply: string;
  products: Record<string, unknown>[];
  pendingActions: PendingActionView[];
}

/** An error with the HTTP status the controller must answer with */
export class AssistantError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 503,
    message: string
  ) {
    super(message);
    this.name = "AssistantError";
  }
}
