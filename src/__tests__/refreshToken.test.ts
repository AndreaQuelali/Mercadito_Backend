import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for Redis so the real rotation logic is exercised
const { store } = vi.hoisted(() => ({
  store: new Map<string, { value: string; ttl?: number }>(),
}));

vi.mock("ioredis", () => {
  class FakeRedis {
    async set(key: string, value: string, _mode?: string, ttl?: number) {
      store.set(key, { value, ttl });
      return "OK";
    }
    async get(key: string) {
      return store.get(key)?.value ?? null;
    }
    async getdel(key: string) {
      const value = store.get(key)?.value ?? null;
      store.delete(key);
      return value;
    }
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    }
  }
  return { default: FakeRedis };
});

import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../tools/refreshToken.tool";
import { ENV } from "../config/env.config";

beforeEach(() => store.clear());

describe("issueRefreshToken", () => {
  it("returns an opaque 256-bit hex token", async () => {
    const token = await issueRefreshToken("u1");

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never stores the raw token, only its hash, with the configured TTL", async () => {
    const token = await issueRefreshToken("u1");

    const keys = [...store.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(token))).toBe(false);
    expect([...store.values()].some((v) => v.value.includes(token))).toBe(false);
    expect([...store.values()].every((v) => v.ttl === ENV.REFRESH_TOKEN_TTL_SECONDS)).toBe(true);
  });

  it("issues a different token each time", async () => {
    expect(await issueRefreshToken("u1")).not.toBe(await issueRefreshToken("u1"));
  });
});

describe("rotateRefreshToken", () => {
  it("returns the owner and a new token", async () => {
    const token = await issueRefreshToken("u1");

    const result = await rotateRefreshToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("u1");
      expect(result.token).not.toBe(token);
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("lets the rotated token be rotated again (chain)", async () => {
    const first = await issueRefreshToken("u1");
    const second = await rotateRefreshToken(first);
    if (!second.ok) throw new Error("rotation failed");

    const third = await rotateRefreshToken(second.token);

    expect(third.ok).toBe(true);
  });

  it("rejects a token that was already used and flags it as reuse", async () => {
    const token = await issueRefreshToken("u1");
    await rotateRefreshToken(token);

    const replay = await rotateRefreshToken(token);

    expect(replay).toEqual({ ok: false, reason: "reused" });
  });

  it("revokes the whole family when an old token is replayed", async () => {
    const first = await issueRefreshToken("u1");
    const second = await rotateRefreshToken(first);
    if (!second.ok) throw new Error("rotation failed");

    await rotateRefreshToken(first); // attacker replays the stolen token

    const legit = await rotateRefreshToken(second.token);
    expect(legit.ok).toBe(false);
  });

  it("rejects an unknown token as invalid", async () => {
    const result = await rotateRefreshToken("f".repeat(64));

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("keeps different users' sessions independent", async () => {
    const a = await issueRefreshToken("alice");
    const b = await issueRefreshToken("bob");
    await rotateRefreshToken(a);
    await rotateRefreshToken(a); // alice's family is revoked

    const bob = await rotateRefreshToken(b);

    expect(bob.ok).toBe(true);
  });

  it("lets only one of two concurrent rotations of the same token succeed", async () => {
    const token = await issueRefreshToken("u1");

    const results = await Promise.all([rotateRefreshToken(token), rotateRefreshToken(token)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("revokeRefreshToken", () => {
  it("makes the token unusable", async () => {
    const token = await issueRefreshToken("u1");

    await revokeRefreshToken(token);

    const result = await rotateRefreshToken(token);
    expect(result.ok).toBe(false);
  });

  it("also kills the rest of the session when the current token is revoked after rotating", async () => {
    const first = await issueRefreshToken("u1");
    const second = await rotateRefreshToken(first);
    if (!second.ok) throw new Error("rotation failed");

    await revokeRefreshToken(second.token);

    expect((await rotateRefreshToken(second.token)).ok).toBe(false);
  });

  it("does not throw for an unknown token", async () => {
    await expect(revokeRefreshToken("0".repeat(64))).resolves.toBeUndefined();
  });
});
