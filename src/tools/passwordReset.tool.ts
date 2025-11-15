import IORedis from "ioredis";
import crypto from "crypto";
import { ENV } from "../config/env.config";

const redis = new IORedis({ host: ENV.REDIS_HOST, port: Number(ENV.REDIS_PORT), maxRetriesPerRequest: null });

const PREFIX = "pwdreset:";
const TTL_SECONDS = 60 * 15; // 15 min

export async function createResetToken(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(PREFIX + token, userId, "EX", TTL_SECONDS);
  return token;
}

export async function getUserIdByResetToken(token: string) {
  const userId = await redis.get(PREFIX + token);
  return userId;
}

export async function deleteResetToken(token: string) {
  await redis.del(PREFIX + token);
}
