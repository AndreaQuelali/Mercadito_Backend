import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiSpec } from "./openapi";

/** Swagger UI at /docs and the raw OpenAPI document at /docs.json. Empty router when disabled. */
export function createDocsRouter(enabled: boolean): Router {
  const router = Router();
  if (!enabled) return router;

  const spec = buildOpenApiSpec();

  router.get("/docs.json", (_req, res) => {
    res.status(200).json(spec);
  });
  router.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec as any, { customSiteTitle: "Mercadito API" })
  );

  return router;
}
