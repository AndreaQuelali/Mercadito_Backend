import { Request, Response } from "express";
import { ENV } from "../../config/env.config";
import { SearchQuerySchema } from "./schemas/searchQuery.schema";
import { searchProductsService } from "./search.service";
import { checkSearchRateLimit } from "./searchRateLimit";

export const searchProducts = async (req: Request, res: Response) => {
  try {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).send({
        message: ENV.NODE_ENV === "development" ? parsed.error.issues : "Bad request",
        status: 400,
        ok: false,
      });
    }

    const userId = req.user?.sub as string | undefined;
    if (!userId) return res.status(401).send({ message: "Unauthorized", status: 401, ok: false });

    const limit = await checkSearchRateLimit(userId);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      return res.status(429).send({ message: "Too many searches, try again later", status: 429, ok: false });
    }

    const data = await searchProductsService(parsed.data);
    res.status(200).send({ message: "Search results", status: 200, ok: true, data });
  } catch (error) {
    console.error("[search] unexpected error", error);
    res.status(500).send({ message: "Error searching products", status: 500, ok: false });
  }
};
