import { Request, Response } from "express";
import { ENV } from "../../config/env.config";
import { AssistantError } from "./assistant.types";
import { ActionIdParamsSchema, ConversationIdParamsSchema, SendMessageSchema } from "./assistant.schemas";
import { checkAssistantRateLimit } from "./assistantRateLimit";
import { confirmAction, rejectAction } from "./actions.service";
import { llmEnabled, llmModelName } from "./llm";
import { assistant, backend, kv } from "./runtime";

const fail = (res: Response, status: number, message: unknown) =>
  res.status(status).send({ message, status, ok: false });

const badRequest = (res: Response, issues: unknown) =>
  fail(res, 400, ENV.NODE_ENV === "development" ? issues : "Bad request");

/** Known failures keep their status; anything else is a 500 that does not leak details */
function handleError(res: Response, error: unknown, what: string) {
  if (error instanceof AssistantError) return fail(res, error.status, error.message);
  console.error(`[assistant] unexpected error ${what}`, error);
  return fail(res, 500, `Error ${what}`);
}

export const getStatus = (_req: Request, res: Response) => {
  res.status(200).send({
    message: "Assistant status",
    status: 200,
    ok: true,
    data: { enabled: llmEnabled(), model: llmModelName() },
  });
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues);

    const userId = req.user?.sub as string | undefined;
    if (!userId) return fail(res, 401, "Unauthorized");

    if (!llmEnabled()) return fail(res, 503, "El asistente está desactivado.");

    const limit = await checkAssistantRateLimit(userId, kv);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return fail(res, 429, "Too many messages, try again later");
    }

    const data = await assistant.sendMessage(userId, parsed.data);
    return res.status(200).send({ message: "Assistant reply", status: 200, ok: true, data });
  } catch (error) {
    return handleError(res, error, "sending the message");
  }
};

export const confirm = async (req: Request, res: Response) => {
  try {
    const params = ActionIdParamsSchema.safeParse(req.params);
    if (!params.success) return fail(res, 404, "Acción no encontrada o vencida");
    const userId = req.user?.sub as string | undefined;
    if (!userId) return fail(res, 401, "Unauthorized");

    const data = await confirmAction({ kv, backend }, userId, params.data.id);
    return res.status(200).send({ message: "Action confirmed", status: 200, ok: true, data });
  } catch (error) {
    return handleError(res, error, "confirming the action");
  }
};

export const reject = async (req: Request, res: Response) => {
  try {
    const params = ActionIdParamsSchema.safeParse(req.params);
    if (!params.success) return fail(res, 404, "Acción no encontrada o vencida");
    const userId = req.user?.sub as string | undefined;
    if (!userId) return fail(res, 401, "Unauthorized");

    const data = await rejectAction({ kv, backend }, userId, params.data.id);
    return res.status(200).send({ message: "Action rejected", status: 200, ok: true, data });
  } catch (error) {
    return handleError(res, error, "rejecting the action");
  }
};

export const getConversation = async (req: Request, res: Response) => {
  try {
    const params = ConversationIdParamsSchema.safeParse(req.params);
    if (!params.success) return fail(res, 404, "Conversación no encontrada");
    const userId = req.user?.sub as string | undefined;
    if (!userId) return fail(res, 401, "Unauthorized");

    const data = await assistant.getConversation(userId, params.data.id);
    return res.status(200).send({ message: "Conversation", status: 200, ok: true, data });
  } catch (error) {
    return handleError(res, error, "reading the conversation");
  }
};
