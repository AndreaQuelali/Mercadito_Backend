import * as z from "zod";
import { Access, Endpoint, endpoints, tags } from "./endpoints";
import { componentSchemas, JsonSchema } from "./schemas";

export const API_VERSION = "1.0.0";

/** Zod validator -> JSON Schema of what the client sends (before transforms/defaults). */
export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  void $schema;
  return rest;
}

const ERROR_RESPONSES: Record<string, { name: string; description: string }> = {
  "400": { name: "BadRequest", description: "Invalid input or the operation was refused" },
  "401": { name: "Unauthorized", description: "Missing, invalid or expired access token, or not allowed for this role" },
  "403": { name: "Forbidden", description: "The account is not allowed to do this" },
  "404": { name: "NotFound", description: "The resource does not exist (or is not yours)" },
  "409": { name: "Conflict", description: "The request conflicts with the current state" },
  "500": { name: "ServerError", description: "Unexpected failure. For POST /auth/refresh keep the session and retry" },
};

const errorRef = (status: number) => ({ $ref: `#/components/responses/${ERROR_RESPONSES[status].name}` });

function implicitErrors(access: Access, hasInput: boolean): number[] {
  const out = new Set<number>();
  if (hasInput) out.add(400);
  if (access !== "public") out.add(401);
  if (access === "seller" || access === "activeSeller" || access === "adminOrActiveSeller") out.add(403);
  out.add(500);
  return [...out];
}

const envelope = (status: number, data?: JsonSchema, extra: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: "object",
  required: ["ok", "status", "message"],
  properties: {
    ok: { type: "boolean", const: true },
    status: { type: "integer", const: status },
    message: { type: "string" },
    ...(data ? { data } : {}),
    ...extra,
  },
});

function parametersOf(ep: Endpoint): unknown[] {
  const params: unknown[] = [];

  for (const name of [...ep.path.matchAll(/:(\w+)/g)].map((m) => m[1])) {
    const type = ep.params?.[name] ?? "integer";
    params.push({
      name,
      in: "path",
      required: true,
      schema: type === "uuid" ? { type: "string", format: "uuid" } : { type: "integer" },
    });
  }

  if (ep.query) {
    const schema = zodToJsonSchema(ep.query) as {
      properties?: Record<string, JsonSchema>;
      required?: string[];
    };
    for (const [name, prop] of Object.entries(schema.properties ?? {})) {
      const { description, ...rest } = prop as { description?: string };
      params.push({
        name,
        in: "query",
        required: schema.required?.includes(name) ?? false,
        ...(description ? { description } : {}),
        schema: rest,
      });
    }
  }
  return params;
}

function buildOperation(ep: Endpoint) {
  const oasPath = ep.path.replace(/:(\w+)/g, "{$1}");
  const status = ep.response?.status ?? 200;
  const parameters = parametersOf(ep);

  const success = ep.response?.text
    ? {
        description: ep.response.description ?? "Success",
        content: { "text/plain": { schema: { type: "string", examples: [ep.response.text] } } },
      }
    : {
        description: ep.response?.description ?? "Success",
        content: {
          "application/json": { schema: envelope(status, ep.response?.data, ep.response?.extra) },
        },
      };

  const errorStatuses = new Set([
    ...implicitErrors(ep.access, !!ep.body || !!ep.query),
    ...(ep.errors ?? []),
  ]);
  const responses: Record<string, unknown> = { [String(status)]: success };
  for (const s of [...errorStatuses].sort()) responses[String(s)] = errorRef(s);

  return {
    operationId: `${ep.method}_${oasPath.slice(1).replace(/[{}]/g, "").replace(/\//g, "_") || "root"}`,
    tags: [ep.tag],
    summary: ep.summary,
    ...(ep.description ? { description: ep.description } : {}),
    security: ep.access === "public" ? [] : [{ bearerAuth: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(ep.body
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToJsonSchema(ep.body),
                ...(ep.bodyExample !== undefined ? { example: ep.bodyExample } : {}),
              },
            },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of endpoints) {
    const oasPath = ep.path.replace(/:(\w+)/g, "{$1}");
    (paths[oasPath] ??= {})[ep.method] = buildOperation(ep);
  }

  const responses: Record<string, unknown> = {};
  for (const [status, { name, description }] of Object.entries(ERROR_RESPONSES)) {
    responses[name] = {
      description,
      content: {
        "application/json": {
          schema: {
            allOf: [{ $ref: "#/components/schemas/Error" }, { properties: { status: { const: Number(status) } } }],
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Mercadito API",
      version: API_VERSION,
      description:
        "REST API of Mercadito, a marketplace for local products.\n\n" +
        "Authenticate with `POST /auth/login`, then send the access token as `Authorization: Bearer <token>`. " +
        "It lasts 15 minutes; renew it with `POST /auth/refresh`.\n\n" +
        "Real-time notifications use Socket.IO (see the README); their history is under `/notification`.",
    },
    servers: [{ url: "/" }],
    tags,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: componentSchemas,
      responses,
    },
  };
}
