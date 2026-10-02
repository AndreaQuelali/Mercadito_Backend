import crypto from "crypto";
import { AssistantBackend, BackendResult } from "./backend";
import { KvStore } from "./kv";
import { AssistantError, Conversation, ConversationMessage, PendingAction, WriteTool } from "./assistant.types";
import { Proposal, cartFingerprint } from "./tools";

export const ACTION_TTL_SECONDS = 10 * 60;
export const CONVERSATION_TTL_SECONDS = 24 * 60 * 60;

export const actionKey = (id: string) => `assistant:action:${id}`;
export const resolvedKey = (id: string) => `assistant:action-resolved:${id}`;
export const conversationKey = (id: string) => `assistant:conv:${id}`;

export interface ActionsDeps {
  kv: KvStore;
  backend: AssistantBackend;
  now?: () => Date;
}

const nowOf = (deps: ActionsDeps) => (deps.now ?? (() => new Date()))();

export async function createPendingAction(
  deps: ActionsDeps,
  input: { userId: string; conversationId: string; type: WriteTool; proposal: Proposal }
): Promise<PendingAction> {
  const now = nowOf(deps);
  const action: PendingAction = {
    id: crypto.randomUUID(),
    userId: input.userId,
    conversationId: input.conversationId,
    type: input.type,
    args: input.proposal.args,
    summary: input.proposal.summary,
    cartFingerprint: input.proposal.cartFingerprint,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACTION_TTL_SECONDS * 1000).toISOString(),
  };
  await deps.kv.set(actionKey(action.id), JSON.stringify(action), ACTION_TTL_SECONDS);
  return action;
}

/** Another user's or an expired action looks exactly like a missing one */
async function loadOwnedAction(deps: ActionsDeps, userId: string, id: string): Promise<PendingAction> {
  const raw = await deps.kv.get(actionKey(id));
  if (!raw) throw new AssistantError(404, "Acción no encontrada o vencida");
  const action = JSON.parse(raw) as PendingAction;
  if (action.userId !== userId) throw new AssistantError(404, "Acción no encontrada o vencida");
  return action;
}

/** Atomic: only the first caller gets the right to resolve the action */
async function claim(deps: ActionsDeps, id: string): Promise<void> {
  const won = await deps.kv.setIfAbsent(resolvedKey(id), "1", ACTION_TTL_SECONDS);
  if (!won) throw new AssistantError(409, "Esta acción ya fue resuelta");
}

async function appendActionEvent(
  deps: ActionsDeps,
  action: PendingAction,
  outcome: "confirmed" | "rejected" | "failed",
  detail: string
) {
  const raw = await deps.kv.get(conversationKey(action.conversationId));
  if (!raw) return; // the conversation expired; nothing to tell the model
  const conversation = JSON.parse(raw) as Conversation;
  const at = nowOf(deps).toISOString();
  const event: ConversationMessage = { role: "action_event", actionId: action.id, outcome, detail, at };
  conversation.messages.push(event);
  conversation.updatedAt = at;
  await deps.kv.set(conversationKey(conversation.id), JSON.stringify(conversation), CONVERSATION_TTL_SECONDS);
}

async function execute(deps: ActionsDeps, action: PendingAction): Promise<BackendResult> {
  const { backend } = deps;
  const a = action.args as any;
  switch (action.type) {
    case "add_to_cart":
      return backend.addToCart(action.userId, { productId: a.productId, quantity: a.quantity });
    case "update_cart_item":
      return backend.updateCartItem(action.userId, a.itemId, a.quantity);
    case "remove_cart_item":
      return backend.removeCartItem(action.userId, a.itemId);
    case "checkout": {
      // The user confirmed the cart they saw: if it changed, a different order must not be created
      const { items } = await backend.getCart(action.userId);
      if (cartFingerprint(items) !== action.cartFingerprint) {
        throw new AssistantError(409, "Tu carrito cambió desde que se propuso el pedido. Pídeme el pedido de nuevo.");
      }
      return backend.checkout(action.userId);
    }
  }
}

export async function confirmAction(deps: ActionsDeps, userId: string, id: string) {
  const action = await loadOwnedAction(deps, userId, id);
  await claim(deps, id);

  let result: BackendResult;
  try {
    result = await execute(deps, action);
  } catch (error) {
    if (error instanceof AssistantError) {
      await appendActionEvent(deps, action, "failed", `${action.summary}: ${error.message}`);
    }
    throw error;
  }
  if (!result.ok) {
    await appendActionEvent(deps, action, "failed", `${action.summary}: ${result.message}`);
    throw new AssistantError(400, result.message);
  }

  await deps.kv.set(actionKey(id), JSON.stringify({ ...action, status: "confirmed" }), ACTION_TTL_SECONDS);
  await appendActionEvent(deps, action, "confirmed", action.summary);
  return { action: { id, type: action.type, status: "confirmed" as const }, result: result.data ?? null };
}

export async function rejectAction(deps: ActionsDeps, userId: string, id: string) {
  const action = await loadOwnedAction(deps, userId, id);
  await claim(deps, id);
  await deps.kv.set(actionKey(id), JSON.stringify({ ...action, status: "rejected" }), ACTION_TTL_SECONDS);
  await appendActionEvent(deps, action, "rejected", action.summary);
  return { action: { id, type: action.type, status: "rejected" as const } };
}
