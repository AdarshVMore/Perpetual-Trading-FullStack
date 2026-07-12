import { createClient } from "redis";
import type { RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export function snapshotKey(channel: string): string {
  return `snapshot:${channel}`;
}

export async function createRedisConnection(): Promise<RedisClientType | null> {
  if (!redisClient) {
    redisClient = createClient({ url: redisUrl }) as RedisClientType;
    redisClient.on("error", (error:Error) => {
      console.log(error);
    });

    await redisClient.connect()
    console.log("redis has connected sucessfully")
  }
  return redisClient;
}
