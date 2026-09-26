/**
 * Builds the Postman collection from the OpenAPI document so both always describe the same API.
 * Regenerate the committed file with `npm run docs:export`.
 */

type Json = Record<string, any>;

const PATH_EXAMPLES: Record<string, string> = { uuid: "00000000-0000-0000-0000-000000000000", integer: "1" };

/** Replaces token examples by the collection variables filled in by the login/refresh scripts */
function withVariables(example: unknown): unknown {
  if (Array.isArray(example)) return example.map(withVariables);
  if (example && typeof example === "object") {
    return Object.fromEntries(
      Object.entries(example).map(([k, v]) => [k, k === "refreshToken" ? "{{REFRESH_TOKEN}}" : withVariables(v)])
    );
  }
  return example;
}

const SAVE_SESSION_SCRIPT = [
  "const body = pm.response.json();",
  "if (body && body.data && body.data.token) {",
  '  pm.collectionVariables.set("TOKEN", body.data.token);',
  '  pm.collectionVariables.set("REFRESH_TOKEN", body.data.refreshToken);',
  "}",
];

const SAVE_SELLER_TOKEN_SCRIPT = [
  "const body = pm.response.json();",
  'if (body && body.token) pm.collectionVariables.set("TOKEN", body.token);',
];

export function buildPostmanCollection(spec: Json): Json {
  const folders = new Map<string, Json[]>();

  for (const [path, ops] of Object.entries<Json>(spec.paths)) {
    for (const [method, op] of Object.entries<Json>(ops)) {
      const segments = path.split("/").filter(Boolean).map((s) => s.replace(/^\{(\w+)\}$/, ":$1"));
      const pathParams = (op.parameters ?? []).filter((p: Json) => p.in === "path");
      const queryParams = (op.parameters ?? []).filter((p: Json) => p.in === "query");
      const query = queryParams.map((p: Json) => ({ key: p.name, value: "", disabled: true, description: p.description }));
      const raw =
        "{{API_URL}}/" + segments.join("/") + (query.length ? "?" + query.map((q: Json) => `${q.key}=`).join("&") : "");

      const body = op.requestBody?.content?.["application/json"];
      const item: Json = {
        name: op.summary,
        request: {
          method: method.toUpperCase(),
          header: body ? [{ key: "Content-Type", value: "application/json" }] : [],
          ...(body
            ? {
                body: {
                  mode: "raw",
                  raw: JSON.stringify(withVariables(body.example ?? {}), null, 2),
                  options: { raw: { language: "json" } },
                },
              }
            : {}),
          url: {
            raw,
            host: ["{{API_URL}}"],
            path: segments,
            ...(query.length ? { query } : {}),
            ...(pathParams.length
              ? {
                  variable: pathParams.map((p: Json) => ({
                    key: p.name,
                    value: PATH_EXAMPLES[p.schema.format === "uuid" ? "uuid" : "integer"],
                  })),
                }
              : {}),
          },
          ...(op.description ? { description: op.description } : {}),
          ...(op.security?.length === 0 ? { auth: { type: "noauth" } } : {}),
        },
      };

      if (method === "post" && (path === "/auth/login" || path === "/auth/refresh")) {
        item.event = [{ listen: "test", script: { type: "text/javascript", exec: SAVE_SESSION_SCRIPT } }];
      } else if (method === "post" && path === "/seller") {
        item.event = [{ listen: "test", script: { type: "text/javascript", exec: SAVE_SELLER_TOKEN_SCRIPT } }];
      }

      const tag = op.tags[0];
      folders.set(tag, [...(folders.get(tag) ?? []), item]);
    }
  }

  return {
    info: {
      name: "Mercadito",
      description: spec.info.description,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{TOKEN}}", type: "string" }] },
    variable: [
      { key: "API_URL", value: "http://localhost:3000" },
      { key: "TOKEN", value: "" },
      { key: "REFRESH_TOKEN", value: "" },
    ],
    item: [...folders.entries()].map(([name, item]) => ({ name, item })),
  };
}
