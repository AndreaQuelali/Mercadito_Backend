import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const env = vi.hoisted(() => ({
  ENV: { EMBEDDINGS_PROVIDER: "voyage", VOYAGE_API_KEY: "key", VOYAGE_MODEL: "voyage-3.5-lite" } as any,
}));
vi.mock("../config/env.config", () => env);

import {
  embedDocuments,
  embedQuery,
  embeddingsAvailable,
  EmbeddingsError,
  EMBEDDING_DIMENSIONS,
} from "../tools/embeddings.tool";

const vec = () => new Array(EMBEDDING_DIMENSIONS).fill(0.1);
const okResponse = (n: number) =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, index) => ({ index, embedding: vec() })) }), { status: 200 });

beforeEach(() => {
  env.ENV.EMBEDDINGS_PROVIDER = "voyage";
  env.ENV.VOYAGE_API_KEY = "key";
});
afterEach(() => vi.unstubAllGlobals());

describe("Voyage embeddings", () => {
  it("indexes with input_type document and 1024 dimensions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(2));
    vi.stubGlobal("fetch", fetchMock);

    const result = await embedDocuments(["a", "b"]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ input: ["a", "b"], model: "voyage-3.5-lite", input_type: "document" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer key");
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1024);
  });

  it("searches with input_type query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(1));
    vi.stubGlobal("fetch", fetchMock);

    const vector = await embedQuery("pan");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_type).toBe("query");
    expect(vector).toHaveLength(1024);
  });

  it("throws a typed error when Voyage answers with an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 429 })));
    await expect(embedQuery("x")).rejects.toMatchObject({ name: "EmbeddingsError", code: "provider_error", status: 429 });
  });

  it("throws a typed error when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(embedQuery("x")).rejects.toBeInstanceOf(EmbeddingsError);
  });

  it("rejects vectors with the wrong dimension", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }), { status: 200 }))
    );
    await expect(embedQuery("x")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("without a key it does not call Voyage and reports not configured", async () => {
    env.ENV.VOYAGE_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(embeddingsAvailable()).toBe(false);
    await expect(embedQuery("x")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fake provider", () => {
  beforeEach(() => {
    env.ENV.EMBEDDINGS_PROVIDER = "fake";
    env.ENV.VOYAGE_API_KEY = "";
  });

  it("is deterministic, 1024-dimensional and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const [a] = await embedDocuments(["Pan de masa madre"]);
    const b = await embedQuery("Pan de masa madre");

    expect(a).toEqual(b);
    expect(a).toHaveLength(1024);
    expect(embeddingsAvailable()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts texts that share words closer than unrelated ones", async () => {
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    const [pan, panIntegral, queso] = await embedDocuments(["pan artesanal", "pan integral artesanal", "queso fresco"]);
    expect(dot(pan, panIntegral)).toBeGreaterThan(dot(pan, queso));
  });
});
