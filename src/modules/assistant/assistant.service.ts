import crypto from "crypto";
import { AssistantBackend } from "./backend";
import { KvStore } from "./kv";
import { LlmClient, LlmError, LlmItem } from "./llm";
import { SYSTEM_PROMPT } from "./prompt";
import { ToolError, isToolName, isWriteTool, llmToolDefs, proposeWriteTool, runReadTool } from "./tools";
import {
  CONVERSATION_TTL_SECONDS,
  ActionsDeps,
  actionKey,
  conversationKey,
  createPendingAction,
  resolvedKey,
} from "./actions.service";
import {
  AssistantError,
  AssistantReply,
  Conversation,
  ConversationMessage,
  ConversationView,
  PendingAction,
  VisibleMessage,
  PendingActionView,
  ReadTool,
  WriteTool,
} from "./assistant.types";

export const MAX_TOOL_CALLS_PER_TURN = 5;
export const HISTORY_WINDOW = 20;

export const UNAVAILABLE_MESSAGE = "El asistente no está disponible por ahora. Inténtalo de nuevo en unos minutos.";
const TOOL_LIMIT_MESSAGE =
  "Hice varias consultas y aun así no logré completar tu pedido. ¿Puedes reformularlo o indicarme el producto con más detalle?";

export interface AssistantDeps {
  kv: KvStore;
  backend: AssistantBackend;
  llm: () => LlmClient;
  now?: () => Date;
}

/** Last 20 messages, starting at a user message so a tool call is never cut from its result */
export function windowHistory(messages: ConversationMessage[]): ConversationMessage[] {
  const tail = messages.slice(-HISTORY_WINDOW);
  const firstUser = tail.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : tail.slice(firstUser);
}

export function toLlmItems(messages: ConversationMessage[]): LlmItem[] {
  return messages.map((m): LlmItem => {
    switch (m.role) {
      case "user":
      case "assistant":
        return { type: "message", role: m.role, content: m.content };
      case "tool_call":
        return { type: "tool_call", callId: m.callId, name: m.name, args: m.args };
      case "tool_result":
        return { type: "tool_result", callId: m.callId, output: JSON.stringify(m.output) };
      case "action_event": {
        const verb = { confirmed: "confirmó y se ejecutó", rejected: "rechazó", failed: "confirmó pero no se pudo ejecutar" }[m.outcome];
        return { type: "message", role: "user", content: `[Evento del sistema] El usuario ${verb} la acción: ${m.detail}` };
      }
    }
  });
}

export function createAssistantService(deps: AssistantDeps) {
  const now = () => (deps.now ?? (() => new Date()))().toISOString();
  const actionsDeps: ActionsDeps = { kv: deps.kv, backend: deps.backend, now: deps.now };

  async function loadConversation(userId: string, conversationId?: string): Promise<Conversation> {
    if (!conversationId) {
      const at = now();
      return { id: crypto.randomUUID(), userId, messages: [], createdAt: at, updatedAt: at };
    }
    const raw = await deps.kv.get(conversationKey(conversationId));
    const conversation = raw ? (JSON.parse(raw) as Conversation) : null;
    // Someone else's conversation looks exactly like a missing one
    if (!conversation || conversation.userId !== userId) throw new AssistantError(404, "Conversación no encontrada");
    return conversation;
  }

  async function save(conversation: Conversation) {
    conversation.updatedAt = now();
    await deps.kv.set(conversationKey(conversation.id), JSON.stringify(conversation), CONVERSATION_TTL_SECONDS);
  }

  async function complete(conversation: Conversation, withTools: boolean) {
    try {
      return await deps.llm().complete({
        system: SYSTEM_PROMPT,
        items: toLlmItems(windowHistory(conversation.messages)),
        tools: withTools ? llmToolDefs() : [],
      });
    } catch (error) {
      if (error instanceof LlmError) {
        console.error(`[assistant] model error (${error.code}):`, error.message);
        throw new AssistantError(503, UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  }

  async function sendMessage(userId: string, input: { conversationId?: string; message: string }): Promise<AssistantReply> {
    const conversation = await loadConversation(userId, input.conversationId);
    conversation.messages.push({ role: "user", content: input.message, at: now() });

    const products = new Map<unknown, Record<string, unknown>>();
    const pendingActions: PendingActionView[] = [];
    let toolCalls = 0;
    let reply: string | null = null;

    while (reply === null) {
      const output = await complete(conversation, toolCalls < MAX_TOOL_CALLS_PER_TURN);

      if (output.type === "text") {
        reply = output.text;
        break;
      }
      // The limit is reached: the last call (without tools) still wants tools, so the turn is closed
      if (toolCalls >= MAX_TOOL_CALLS_PER_TURN) {
        reply = TOOL_LIMIT_MESSAGE;
        break;
      }

      for (const call of output.calls) {
        conversation.messages.push({ role: "tool_call", callId: call.callId, name: call.name as any, args: call.args, at: now() });

        let result: unknown;
        if (toolCalls >= MAX_TOOL_CALLS_PER_TURN) {
          result = { error: "Se alcanzó el límite de herramientas de este turno." };
        } else if (!isToolName(call.name)) {
          toolCalls++;
          result = { error: `La herramienta ${call.name} no existe.` };
        } else {
          toolCalls++;
          try {
            const ctx = { userId, backend: deps.backend };
            if (isWriteTool(call.name)) {
              const type: WriteTool = call.name;
              const proposal = await proposeWriteTool(type, call.args, ctx);
              const action = await createPendingAction(actionsDeps, {
                userId,
                conversationId: conversation.id,
                type,
                proposal,
              });
              pendingActions.push({ id: action.id, type, summary: action.summary, expiresAt: action.expiresAt });
              result = {
                status: "pending_confirmation",
                actionId: action.id,
                summary: action.summary,
                message:
                  "La acción NO se ejecutó: queda esperando que el usuario la confirme con el botón. Díselo y no afirmes que ya se hizo.",
              };
            } else {
              const read = await runReadTool(call.name as ReadTool, call.args, ctx);
              for (const p of read.products) products.set((p as any).id, p);
              result = read.output;
            }
          } catch (error) {
            if (!(error instanceof ToolError)) {
              console.error(`[assistant] tool ${call.name} failed`, error);
              result = { error: "La herramienta falló. Inténtalo de nuevo más tarde." };
            } else {
              result = { error: error.message };
            }
          }
        }
        conversation.messages.push({ role: "tool_result", callId: call.callId, output: result, at: now() });
      }
    }

    conversation.messages.push({ role: "assistant", content: reply, at: now() });
    await save(conversation);
    return { conversationId: conversation.id, reply, products: [...products.values()], pendingActions };
  }

  /** Lets the browser resume a conversation after a reload. Internal tool messages are never exposed. */
  async function getConversation(userId: string, conversationId: string): Promise<ConversationView> {
    const conversation = await loadConversation(userId, conversationId);

    const messages: VisibleMessage[] = [];
    const actionIds: string[] = [];
    for (const m of conversation.messages) {
      if (m.role === "user" || m.role === "assistant") messages.push({ role: m.role, content: m.content, at: m.at });
      else if (m.role === "action_event") messages.push({ role: "action_event", content: m.detail, at: m.at });
      else if (m.role === "tool_result") {
        const out = m.output as { status?: string; actionId?: string } | null;
        if (out?.status === "pending_confirmation" && out.actionId) actionIds.push(out.actionId);
      }
    }

    // Only actions still waiting: not expired, not resolved, not confirmed or rejected
    const pendingActions: PendingActionView[] = [];
    const nowMs = (deps.now ?? (() => new Date()))().getTime();
    for (const id of actionIds) {
      const raw = await deps.kv.get(actionKey(id));
      if (!raw) continue;
      const action = JSON.parse(raw) as PendingAction;
      if (action.userId !== userId || action.status !== "pending") continue;
      if (new Date(action.expiresAt).getTime() <= nowMs) continue;
      if (await deps.kv.get(resolvedKey(id))) continue;
      pendingActions.push({ id: action.id, type: action.type, summary: action.summary, expiresAt: action.expiresAt });
    }

    return { conversationId: conversation.id, messages, pendingActions };
  }

  return { sendMessage, getConversation };
}
