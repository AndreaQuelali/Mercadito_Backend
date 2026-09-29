import * as z from "zod";

export const NotificationSettingsSchema = z
  .object({
    "order:new": z.boolean().optional().describe("A buyer placed an order with my products"),
    "stock:low": z.boolean().optional().describe("A sale left one of my products at or below the low stock threshold"),
    "review:new": z.boolean().optional().describe("A buyer reviewed one of my products"),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one preference is required" });

export type NotificationSettingsInput = z.infer<typeof NotificationSettingsSchema>;
