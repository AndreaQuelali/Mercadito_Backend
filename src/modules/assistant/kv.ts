import IORedis from "ioredis";
import { ENV } from "../../config/env.config";

/** The Redis operations the assistant uses; tests and the eval script pass an in-memory version */
export interface KvStore {
  get(key: string): Promise<string | null>;
  /** Writes with a TTL in seconds */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Writes only if the key does not exist (atomic). Returns whether it was written */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

let redis: IORedis | null = null;
const client = (): IORedis => {
  if (!redis) {
    redis = new IORedis({ host: ENV.REDIS_HOST, port: Number(ENV.REDIS_PORT), maxRetriesPerRequest: null });
  }
  return redis;
};

export const redisKv: KvStore = {
  get: (key) => client().get(key),
  set: async (key, value, ttlSeconds) => {
    await client().set(key, value, "EX", ttlSeconds);
  },
  setIfAbsent: async (key, value, ttlSeconds) => (await client().set(key, value, "EX", ttlSeconds, "NX")) === "OK",
  incr: (key) => client().incr(key),
  expire: (key, seconds) => client().expire(key, seconds),
  ttl: (key) => client().ttl(key),
};

/** In-memory store for tests and the eval script (TTLs are recorded, not enforced) */
export function createMemoryKv(): KvStore & { data: Map<string, string>; ttls: Map<string, number> } {
  const data = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    data,
    ttls,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value, ttl) => {
      data.set(key, value);
      ttls.set(key, ttl);
    },
    setIfAbsent: async (key, value, ttl) => {
      if (data.has(key)) return false;
      data.set(key, value);
      ttls.set(key, ttl);
      return true;
    },
    incr: async (key) => {
      const n = Number(data.get(key) ?? 0) + 1;
      data.set(key, String(n));
      return n;
    },
    expire: async (key, seconds) => void ttls.set(key, seconds),
    ttl: async (key) => ttls.get(key) ?? -1,
  };
}
