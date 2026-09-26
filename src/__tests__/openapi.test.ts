import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";
import * as z from "zod";
import { Category, OrderStatus } from "@prisma/client";

// Importing the real routers must not open any connection
vi.mock("../config/prisma", () => ({ default: {}, prisma: { $connect: vi.fn() } }));
vi.mock("../tools/mail.tool", () => ({ sendOrderConfirmedEmail: vi.fn(), initMailWorker: vi.fn() }));
vi.mock("../tools/mailQueue.tool", () => ({ enqueueMail: vi.fn(), mailQueue: {}, initMailWorker: vi.fn() }));
vi.mock("../tools/passwordReset.tool", () => ({
  createResetToken: vi.fn(),
  deleteResetToken: vi.fn(),
  getUserIdByResetToken: vi.fn(),
}));
vi.mock("../tools/refreshToken.tool", () => ({
  issueRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

import { buildOpenApiSpec } from "../docs/openapi";
import { buildPostmanCollection } from "../docs/postman";
import { createDocsRouter } from "../docs/docs.router";
import { routeMounts } from "../config/server.routes";
import { CreateProductSchema } from "../modules/products/schemas/createProduct.schema";
import { RefreshSchema } from "../modules/auth/schemas/refresh.schema";
import { RegisterSchema } from "../modules/auth/schemas/register.schema";

type Spec = ReturnType<typeof buildOpenApiSpec>;
const spec = buildOpenApiSpec() as any as Spec & { paths: Record<string, Record<string, any>>; components: any };
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

const documented = (): string[] =>
  Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)
  );

const registered = (): string[] => {
  const out: string[] = [];
  for (const [prefix, router] of routeMounts) {
    for (const layer of (router as any).stack) {
      if (!layer.route) continue;
      const full = (prefix === "/" ? "" : prefix) + (layer.route.path === "/" ? "" : layer.route.path);
      const oasPath = (full || "/").replace(/:(\w+)/g, "{$1}");
      for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${oasPath}`);
    }
  }
  return out;
};

const walk = (node: unknown, visit: (n: any) => void) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === "object") {
    visit(node);
    Object.values(node).forEach((n) => walk(n, visit));
  }
};

describe("OpenAPI document", () => {
  it("is an OpenAPI 3.1 document with bearer auth", () => {
    expect((spec as any).openapi).toBe("3.1.0");
    expect((spec as any).info.title).toBeTruthy();
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("documents every route the app registers, and nothing else", () => {
    const docs = documented().sort();
    const routes = registered().sort();

    expect(routes.length).toBeGreaterThan(30);
    expect(docs).toEqual(routes);
  });

  it("gives every operation a summary, a tag, an id and a 2xx response", () => {
    const ids = new Set<string>();
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops) as [string, any][]) {
        expect(HTTP_METHODS).toContain(m);
        expect(op.summary, `${m} ${p} summary`).toBeTruthy();
        expect(op.tags?.length, `${m} ${p} tags`).toBeGreaterThan(0);
        expect(Object.keys(op.responses).some((s) => s.startsWith("2")), `${m} ${p} 2xx`).toBe(true);
        expect(ids.has(op.operationId), `duplicated operationId ${op.operationId}`).toBe(false);
        ids.add(op.operationId);
      }
    }
  });

  it("declares every path parameter", () => {
    for (const [p, ops] of Object.entries(spec.paths)) {
      const names = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const op of Object.values(ops) as any[]) {
        const declared = (op.parameters ?? []).filter((x: any) => x.in === "path").map((x: any) => x.name);
        expect(declared.sort(), p).toEqual(names.sort());
        for (const x of op.parameters ?? []) if (x.in === "path") expect(x.required).toBe(true);
      }
    }
  });

  it("resolves every $ref", () => {
    walk(spec, (n) => {
      if (typeof n.$ref !== "string") return;
      const [, ...parts] = n.$ref.replace("#/", "").split("/");
      const section = n.$ref.replace("#/", "").split("/")[0];
      expect(section).toBe("components");
      let cur: any = spec.components;
      for (const part of n.$ref.replace("#/components/", "").split("/")) {
        expect(cur?.[part], n.$ref).toBeDefined();
        cur = cur[part];
      }
      void parts;
    });
  });

  it("marks protected operations with bearer auth and a 401, and public ones without", () => {
    const publicOps = [
      "GET /health",
      "GET /product",
      "GET /product/{id}",
      "GET /review/product/{productId}",
      "POST /auth/register",
      "POST /auth/login",
      "POST /auth/refresh",
      "POST /auth/logout",
      "POST /auth/password/forgot",
      "POST /auth/password/reset",
    ];
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops) as [string, any][]) {
        const key = `${m.toUpperCase()} ${p}`;
        if (publicOps.includes(key)) {
          expect(op.security ?? [], key).toEqual([]);
        } else {
          expect(op.security, key).toEqual([{ bearerAuth: [] }]);
          expect(op.responses["401"], key).toBeDefined();
        }
      }
    }
  });

  it("documents 403 for seller-only operations", () => {
    for (const key of [
      ["post", "/product"],
      ["put", "/product/{id}"],
      ["delete", "/product/{id}"],
      ["get", "/product/mine"],
      ["get", "/order/seller/mine"],
      ["delete", "/seller/mine"],
    ]) {
      expect(spec.paths[key[1]][key[0]].responses["403"], key.join(" ")).toBeDefined();
    }
  });

  it("documents the session endpoints", () => {
    const login = spec.paths["/auth/login"].post.responses["200"].content["application/json"].schema;
    expect(login.properties.data.$ref).toBe("#/components/schemas/AuthSession");
    expect(spec.components.schemas.AuthSession.required).toEqual(
      expect.arrayContaining(["token", "refreshToken"])
    );
    expect(spec.paths["/auth/refresh"].post.responses["401"]).toBeDefined();
    expect(spec.paths["/auth/logout"].post).toBeDefined();
  });
});

describe("request schemas come from the Zod validators", () => {
  const bodyOf = (p: string, m: string) =>
    spec.paths[p][m].requestBody.content["application/json"].schema;
  const expected = (schema: z.ZodType) => {
    const { $schema, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as any;
    void $schema;
    return rest;
  };

  it("uses the product validator for POST /product", () => {
    expect(bodyOf("/product", "post")).toEqual(expected(CreateProductSchema));
    expect(bodyOf("/product", "post").properties.category.enum).toEqual(Object.values(Category));
  });

  it("uses the refresh validator for POST /auth/refresh", () => {
    expect(bodyOf("/auth/refresh", "post")).toEqual(expected(RefreshSchema));
    expect(bodyOf("/auth/refresh", "post").required).toContain("refreshToken");
  });

  it("keeps the password policy of registration", () => {
    expect(bodyOf("/auth/register", "post")).toEqual(expected(RegisterSchema));
    expect(bodyOf("/auth/register", "post").properties.password.pattern).toBeTruthy();
  });

  it("exposes the order statuses on PATCH /order/{id}/status", () => {
    expect(bodyOf("/order/{id}/status", "patch").properties.status.enum).toEqual(Object.values(OrderStatus));
  });

  it("documents notification query parameters with their limits", () => {
    const params = spec.paths["/notification"].get.parameters;
    const limit = params.find((x: any) => x.name === "limit");
    expect(limit).toMatchObject({ in: "query", required: false });
    expect(limit.schema.maximum).toBe(50);
    expect(params.map((x: any) => x.name).sort()).toEqual(["limit", "page", "unread"]);
  });

  it("documents the product filters", () => {
    const names = spec.paths["/product"].get.parameters.map((x: any) => x.name).sort();
    expect(names).toEqual(["category", "endAt", "maxPrice", "minPrice", "name", "startAt"]);
  });

  it("gives every request body an example", () => {
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops) as [string, any][]) {
        if (!op.requestBody) continue;
        expect(op.requestBody.content["application/json"].example, `${m} ${p}`).toBeDefined();
      }
    }
  });
});

describe("docs router", () => {
  const app = express();
  app.use(createDocsRouter(true));

  it("serves the raw spec at /docs.json", async () => {
    const res = await request(app).get("/docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths).length).toBe(Object.keys(spec.paths).length);
  });

  it("serves Swagger UI at /docs", async () => {
    const res = await request(app).get("/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/swagger/i);
  });

  it("serves nothing when disabled", async () => {
    const off = express();
    off.use(createDocsRouter(false));

    expect((await request(off).get("/docs.json")).status).toBe(404);
    expect((await request(off).get("/docs/")).status).toBe(404);
  });
});

describe("ENABLE_DOCS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async () => (await import("../config/env.config")).ENV.ENABLE_DOCS;

  it("is on by default outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DOCS", "");
    vi.resetModules();

    expect(await load()).toBe(true);
  });

  it("is off by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "x");
    vi.stubEnv("ENABLE_DOCS", "");
    vi.resetModules();

    expect(await load()).toBe(false);
  });

  it("can be forced on in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "x");
    vi.stubEnv("ENABLE_DOCS", "true");
    vi.resetModules();

    expect(await load()).toBe(true);
  });
});

describe("Postman collection", () => {
  const collection = buildPostmanCollection(spec as any) as any;
  const requests = (items: any[]): any[] => items.flatMap((i) => (i.item ? requests(i.item) : [i]));

  it("has one request per documented operation", () => {
    expect(requests(collection.item)).toHaveLength(documented().length);
  });

  it("uses collection variables and stores the tokens on login", () => {
    expect(collection.variable.map((v: any) => v.key)).toEqual(
      expect.arrayContaining(["API_URL", "TOKEN", "REFRESH_TOKEN"])
    );
    const login = requests(collection.item).find((r) => r.request.url.raw.endsWith("/auth/login"));
    expect(JSON.stringify(login.event)).toContain("TOKEN");
  });

  it("matches the committed Mercadito.postman_collection.json", () => {
    const file = path.resolve(__dirname, "../../Mercadito.postman_collection.json");
    const committed = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(committed).toEqual(JSON.parse(JSON.stringify(collection)));
  });
});
