import * as z from "zod";

export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;
