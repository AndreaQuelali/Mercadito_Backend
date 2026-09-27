import * as z from "zod";

/** A plain date (YYYY-MM-DD, UTC) or a full ISO 8601 datetime with offset */
const dateOrDatetime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const SalesQuerySchema = z.object({
  from: dateOrDatetime.optional().describe("Start of the range, inclusive (default: no lower bound)"),
  to: dateOrDatetime
    .optional()
    .describe("End of the range, inclusive. A plain date includes that whole day (default: no upper bound)"),
});

export type SalesQuery = z.infer<typeof SalesQuerySchema>;
