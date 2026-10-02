import { ENV } from "../../config/env.config";
import { RateLimitResult } from "../search/searchRateLimit";
import { KvStore } from "./kv";

const WINDOW_SECONDS = 60;

/** Fixed window per user, same scheme as the search limit but with its own key */
export async function checkAssistantRateLimit(
  userId: string,
  store: KvStore,
  limit: number = ENV.ASSISTANT_RATE_LIMIT_PER_MIN
): Promise<RateLimitResult> {
  const key = `assistant-rate:${userId}`;
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, WINDOW_SECONDS);
  if (count <= limit) return { allowed: true, retryAfter: 0 };
  const ttl = await store.ttl(key);
  if (ttl < 0) await store.expire(key, WINDOW_SECONDS); // a key without TTL would block forever
  return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_SECONDS };
}
