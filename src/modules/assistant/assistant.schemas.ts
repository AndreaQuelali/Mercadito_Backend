import * as z from "zod";

export const SendMessageSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1, "message is required").max(1000, "message must be at most 1000 characters"),
});

export const ActionIdParamsSchema = z.object({ id: z.uuid() });

export const ConversationIdParamsSchema = z.object({ id: z.uuid() });

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
