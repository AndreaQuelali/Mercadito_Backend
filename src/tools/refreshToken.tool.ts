import IORedis from "ioredis";
import crypto from "crypto";
import { ENV } from "../config/env.config";

/**
 * Rotating refresh tokens stored in Redis.
 *
 * - The token is opaque (256 random bits); only its SHA-256 hash is stored.
 * - Every use rotates it: the old token is consumed atomically (GETDEL) and a new one
 *   is issued in the same "family" (one login session).
 * - Replaying an already used token is treated as theft: the whole family is revoked.
 *
 * Keys:
 *   refresh:<hash>         -> { userId, familyId }   the live token
 *   refresh-used:<hash>    -> familyId               tombstone of a rotated token
 *   refresh-family:<id>    -> <hash>                 the family's single live token
 */
const TOKEN_PREFIX = "refresh:";
const USED_PREFIX = "refresh-used:";
const FAMILY_PREFIX = "refresh-family:";

// Created lazily so importing this module never opens a connection (tests, scripts)
let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis({
      host: ENV.REDIS_HOST,
      port: Number(ENV.REDIS_PORT),
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export type RotateResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: "invalid" | "reused" };

async function storeToken(userId: string, familyId: string): Promise<string> {
  const r = getRedis();
  const token = crypto.randomBytes(32).toString("hex");
  const h = hash(token);
  const ttl = ENV.REFRESH_TOKEN_TTL_SECONDS;

  await r.set(TOKEN_PREFIX + h, JSON.stringify({ userId, familyId }), "EX", ttl);
  await r.set(FAMILY_PREFIX + familyId, h, "EX", ttl);
  return token;
}

async function revokeFamily(familyId: string): Promise<void> {
  const r = getRedis();
  const liveHash = await r.get(FAMILY_PREFIX + familyId);
  const keys = [FAMILY_PREFIX + familyId];
  if (liveHash) keys.push(TOKEN_PREFIX + liveHash);
  await r.del(...keys);
}

/** Starts a new session (family) for the user and returns its first refresh token. */
export async function issueRefreshToken(userId: string): Promise<string> {
  return storeToken(userId, crypto.randomUUID());
}

/** Consumes a refresh token and issues its successor. Detects replays of used tokens. */
export async function rotateRefreshToken(token: string): Promise<RotateResult> {
  const r = getRedis();
  const h = hash(token);

  // Atomic: of two concurrent requests with the same token only one gets the value
  const raw = await r.getdel(TOKEN_PREFIX + h);

  if (!raw) {
    const usedFamily = await r.get(USED_PREFIX + h);
    if (usedFamily) {
      await revokeFamily(usedFamily);
      return { ok: false, reason: "reused" };
    }
    return { ok: false, reason: "invalid" };
  }

  const { userId, familyId } = JSON.parse(raw) as { userId: string; familyId: string };
  await r.set(USED_PREFIX + h, familyId, "EX", ENV.REFRESH_TOKEN_TTL_SECONDS);

  return { ok: true, userId, token: await storeToken(userId, familyId) };
}

/** Ends the session the token belongs to. Idempotent; unknown tokens are ignored. */
export async function revokeRefreshToken(token: string): Promise<void> {
  const r = getRedis();
  const h = hash(token);

  const raw = await r.getdel(TOKEN_PREFIX + h);
  if (raw) {
    const { familyId } = JSON.parse(raw) as { familyId: string };
    await r.del(FAMILY_PREFIX + familyId);
    return;
  }

  // A stale (already rotated) token still identifies its session: end it too
  const usedFamily = await r.get(USED_PREFIX + h);
  if (usedFamily) await revokeFamily(usedFamily);
}
