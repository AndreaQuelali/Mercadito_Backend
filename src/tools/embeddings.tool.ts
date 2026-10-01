import crypto from "crypto";
import { ENV } from "../config/env.config";

export const EMBEDDING_DIMENSIONS = 1024;
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/** Voyage is not configured (no API key) or answered with an error */
export class EmbeddingsError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "provider_error" | "bad_response",
    public readonly status?: number
  ) {
    super(message);
    this.name = "EmbeddingsError";
  }
}

/** Whether embeddings can be produced at all (fake provider, or a Voyage key) */
export function embeddingsAvailable(): boolean {
  return ENV.EMBEDDINGS_PROVIDER === "fake" || Boolean(ENV.VOYAGE_API_KEY);
}

/** Name stored next to each vector; a different model forces a reindex */
export function embeddingModelName(): string {
  return ENV.EMBEDDINGS_PROVIDER === "fake" ? "fake" : ENV.VOYAGE_MODEL;
}

/**
 * Deterministic vector for tests: every word hashes to a few dimensions, so texts that
 * share words are close in cosine distance and unrelated texts are not.
 */
function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  for (const word of words) {
    const digest = crypto.createHash("sha256").update(word).digest();
    for (let i = 0; i < 3; i++) {
      vector[digest.readUInt16BE(i * 2) % EMBEDDING_DIMENSIONS] += 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) vector[0] = 1;
  else for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

type InputType = "document" | "query";

async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (ENV.EMBEDDINGS_PROVIDER === "fake") return texts.map(fakeEmbedding);

  if (!ENV.VOYAGE_API_KEY) {
    throw new EmbeddingsError("VOYAGE_API_KEY is not configured", "not_configured");
  }

  let response: Response;
  try {
    response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: texts,
        model: ENV.VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });
  } catch (error) {
    throw new EmbeddingsError(`Voyage request failed: ${(error as Error).message}`, "provider_error");
  }

  if (!response.ok) {
    throw new EmbeddingsError(`Voyage answered ${response.status}`, "provider_error", response.status);
  }

  const body = (await response.json()) as { data?: { embedding: number[]; index: number }[] };
  const items = body.data;
  if (!Array.isArray(items) || items.length !== texts.length) {
    throw new EmbeddingsError("Voyage returned an unexpected number of embeddings", "bad_response");
  }
  const ordered = [...items].sort((a, b) => a.index - b.index).map((i) => i.embedding);
  if (ordered.some((e) => !Array.isArray(e) || e.length !== EMBEDDING_DIMENSIONS)) {
    throw new EmbeddingsError(`Voyage returned vectors that are not ${EMBEDDING_DIMENSIONS}-dimensional`, "bad_response");
  }
  return ordered;
}

export const embedDocuments = (texts: string[]) => embed(texts, "document");

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}

/** pgvector text literal: "[0.1,0.2,...]" */
export const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
