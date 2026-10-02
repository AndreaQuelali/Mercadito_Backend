import OpenAI from "openai";
import { ENV } from "../../config/env.config";

/**
 * Minimal model interface owned by Mercadito: the loop and the tools never see the OpenAI SDK,
 * so the e2e tests can use a scripted model and the provider can change without touching them.
 */

export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON Schema of the arguments */
  parameters: Record<string, unknown>;
}

export type LlmItem =
  | { type: "message"; role: "user" | "assistant"; content: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "tool_result"; callId: string; output: string };

export interface LlmRequest {
  system: string;
  items: LlmItem[];
  tools: LlmToolDef[];
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LlmOutput = (
  | { type: "text"; text: string }
  | { type: "tool_calls"; calls: { callId: string; name: string; args: unknown }[] }
) & { usage?: LlmUsage };

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmOutput>;
}

/** The model is not configured, timed out or answered with an error */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "timeout" | "provider_error" | "bad_response"
  ) {
    super(message);
    this.name = "LlmError";
  }
}

// ---------- OpenAI (Responses API, function calling, store: false) ----------

export function toOpenAiInput(items: LlmItem[]): Record<string, unknown>[] {
  return items.map((item) => {
    switch (item.type) {
      case "message":
        return { role: item.role, content: item.content };
      case "tool_call":
        return {
          type: "function_call",
          call_id: item.callId,
          name: item.name,
          arguments: JSON.stringify(item.args ?? {}),
        };
      case "tool_result":
        return { type: "function_call_output", call_id: item.callId, output: item.output };
    }
  });
}

export function toOpenAiTools(tools: LlmToolDef[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

/** Function calls win over text; unparsable arguments are passed on as a string so the tool can reject them */
export function parseOpenAiResponse(response: {
  output?: unknown[];
  usage?: { input_tokens?: number; output_tokens?: number };
}): LlmOutput {
  const usage = response.usage
    ? { inputTokens: response.usage.input_tokens ?? 0, outputTokens: response.usage.output_tokens ?? 0 }
    : undefined;
  const output = Array.isArray(response.output) ? (response.output as any[]) : [];
  const calls = output
    .filter((o) => o?.type === "function_call")
    .map((o) => {
      let args: unknown = o.arguments;
      if (typeof o.arguments === "string") {
        try {
          args = o.arguments.trim() ? JSON.parse(o.arguments) : {};
        } catch {
          args = o.arguments;
        }
      }
      return { callId: String(o.call_id), name: String(o.name), args };
    });
  if (calls.length > 0) return { type: "tool_calls", calls, usage };

  const text = output
    .filter((o) => o?.type === "message")
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
    .filter((c: any) => c?.type === "output_text" && typeof c.text === "string")
    .map((c: any) => c.text)
    .join("")
    .trim();
  if (!text) throw new LlmError("The model returned neither text nor tool calls", "bad_response");
  return { type: "text", text, usage };
}

/** The slice of the SDK this file uses, so tests can inject a mock */
export interface OpenAiLike {
  responses: {
    create(
      body: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<{ output?: unknown[]; usage?: { input_tokens?: number; output_tokens?: number } }>;
  };
}

export function createOpenAiClient(sdk: OpenAiLike, model: string, timeoutMs: number): LlmClient {
  return {
    async complete({ system, items, tools }) {
      try {
        const body: Record<string, unknown> = {
          model,
          instructions: system,
          input: toOpenAiInput(items),
          store: false,
        };
        if (tools.length > 0) body.tools = toOpenAiTools(tools);
        const response = await sdk.responses.create(body, { timeout: timeoutMs, maxRetries: 0 });
        return parseOpenAiResponse(response);
      } catch (error) {
        if (error instanceof LlmError) throw error;
        const e = error as { name?: string; message?: string };
        const timedOut = e?.name === "APIConnectionTimeoutError" || e?.name === "AbortError" || /timed? ?out/i.test(e?.message ?? "");
        throw new LlmError(e?.message ?? "OpenAI request failed", timedOut ? "timeout" : "provider_error");
      }
    },
  };
}

// ---------- Fake (tests only) ----------

const findLastUser = (items: LlmItem[]): string => {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === "message" && item.role === "user" && !item.content.startsWith("[Evento del sistema]")) {
      return item.content;
    }
  }
  return "";
};

let fakeCounter = 0;
const nextCallId = () => `fake_call_${++fakeCounter}`;

/**
 * Scripted model: reacts to keywords of the last user message.
 *   "agrega 2 <word>"      -> search_products(<word>) then add_to_cart(first result, 2)
 *   "busca <word>"         -> search_products(<word>)
 *   "quita <itemId>"       -> remove_cart_item
 *   "cambia <itemId> a N"  -> update_cart_item
 *   "pedido" / "checkout"  -> checkout
 *   "carrito"              -> view_cart
 * Anything else gets a fixed answer.
 */
export function createFakeLlmClient(): LlmClient {
  return {
    async complete({ items, tools }) {
      const last = items[items.length - 1];
      const userText = findLastUser(items).toLowerCase();

      // Right after a tool result
      if (last?.type === "tool_result") {
        const call = [...items].reverse().find((i) => i.type === "tool_call" && i.callId === last.callId);
        const add = /agrega(?:r)?\s+(\d+)\s+/.exec(userText);
        if (call?.type === "tool_call" && call.name === "search_products" && add) {
          let output: any = {};
          try {
            output = JSON.parse(last.output);
          } catch {
            /* ignore */
          }
          const first = output?.products?.[0];
          if (first && tools.some((t) => t.name === "add_to_cart")) {
            return {
              type: "tool_calls",
              calls: [{ callId: nextCallId(), name: "add_to_cart", args: { productId: first.id, quantity: Number(add[1]) } }],
            };
          }
          return { type: "text", text: "No encontré ese producto en Mercadito." };
        }
        if (call?.type === "tool_call" && call.name === "search_products") {
          return { type: "text", text: "Esto es lo que encontré en Mercadito." };
        }
        if (call?.type === "tool_call" && call.name === "view_cart") {
          return { type: "text", text: "Este es tu carrito." };
        }
        return { type: "text", text: "Listo, queda esperando tu confirmación." };
      }

      if (tools.length === 0) return { type: "text", text: "Ya no puedo consultar más por ahora." };

      let match: RegExpExecArray | null;
      if ((match = /agrega(?:r)?\s+(\d+)\s+(.+)/.exec(userText))) {
        const word = match[2].trim().split(/\s+/)[0];
        return { type: "tool_calls", calls: [{ callId: nextCallId(), name: "search_products", args: { q: word } }] };
      }
      if ((match = /busca(?:r)?\s+(.+)/.exec(userText))) {
        return { type: "tool_calls", calls: [{ callId: nextCallId(), name: "search_products", args: { q: match[1].trim() } }] };
      }
      if ((match = /quita(?:r)?\s+(\d+)/.exec(userText))) {
        return { type: "tool_calls", calls: [{ callId: nextCallId(), name: "remove_cart_item", args: { itemId: Number(match[1]) } }] };
      }
      if ((match = /cambia(?:r)?\s+(\d+)\s+a\s+(\d+)/.exec(userText))) {
        return {
          type: "tool_calls",
          calls: [{ callId: nextCallId(), name: "update_cart_item", args: { itemId: Number(match[1]), quantity: Number(match[2]) } }],
        };
      }
      if (/pedido|checkout/.test(userText)) {
        return { type: "tool_calls", calls: [{ callId: nextCallId(), name: "checkout", args: {} }] };
      }
      if (/carrito/.test(userText)) {
        return { type: "tool_calls", calls: [{ callId: nextCallId(), name: "view_cart", args: {} }] };
      }
      return { type: "text", text: "Puedo ayudarte a buscar productos y manejar tu carrito en Mercadito." };
    },
  };
}

// ---------- Factory ----------

export function llmEnabled(): boolean {
  return ENV.LLM_PROVIDER === "fake" || Boolean(ENV.OPENAI_API_KEY);
}

export function llmModelName(): string | null {
  if (!llmEnabled()) return null;
  return ENV.LLM_PROVIDER === "fake" ? "fake" : ENV.OPENAI_MODEL;
}

let cached: LlmClient | null = null;
export function getLlmClient(): LlmClient {
  if (cached) return cached;
  if (ENV.LLM_PROVIDER === "fake") {
    cached = createFakeLlmClient();
  } else {
    if (!ENV.OPENAI_API_KEY) throw new LlmError("OPENAI_API_KEY is not set", "not_configured");
    const sdk = new OpenAI({ apiKey: ENV.OPENAI_API_KEY, maxRetries: 0, timeout: ENV.ASSISTANT_TIMEOUT_MS });
    cached = createOpenAiClient(sdk as unknown as OpenAiLike, ENV.OPENAI_MODEL, ENV.ASSISTANT_TIMEOUT_MS);
  }
  return cached;
}
