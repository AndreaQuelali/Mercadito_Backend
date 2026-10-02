import IORedis from "ioredis";
import { ENV } from "../../config/env.config";

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets */
  retryAfter: number;
}

export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

const WINDOW_SECONDS = 60;

let redis: IORedis | null = null;
const defaultStore = (): RateLimitStore => {
  if (!redis) {
    redis = new IORedis({ host: ENV.REDIS_HOST, port: Number(ENV.REDIS_PORT), maxRetriesPerRequest: null });
  }
  return redis;
};

/**
 * Fixed window per user: the first search of a minute starts the window,
 * the (limit + 1)th inside it is refused. The key expires by itself.
 */
export async function checkSearchRateLimit(
  userId: string,
  limit: number = ENV.SEARCH_RATE_LIMIT_PER_MIN,
  store: RateLimitStore = defaultStore()
): Promise<RateLimitResult> {
  const key = `search-rate:${userId}`;
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, WINDOW_SECONDS);
  if (count <= limit) return { allowed: true, retryAfter: 0 };
  const ttl = await store.ttl(key);
  if (ttl < 0) await store.expire(key, WINDOW_SECONDS); // a key without TTL would block forever
  return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_SECONDS };
}
