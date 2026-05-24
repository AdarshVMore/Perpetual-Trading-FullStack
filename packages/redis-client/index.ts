import { createClient } from "redis";
import type { RedisClientType } from "redis";

const redisClient: RedisClientType | null = null;

const redisUrl = "redis://resis:6379";

export async function createRedisConnection(): Promise<RedisClientType | null> {
  if (!redisClient) {
    const redisClient = createClient({ url: redisUrl }) as RedisClientType;
    redisClient.on("error", (error:Error) => {
      console.log(error);
    });

    await redisClient.connect()
    console.log("redis has connected sucessfully")
  }
  return redisClient;
}
